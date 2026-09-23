import { randomUUID } from 'crypto';

import { eq, inArray } from 'drizzle-orm';

import * as schema from '../src/db/schema';
import { AchievementRepository } from '../src/modules/achievement/achievement.repository';
import { DashboardWidgetRepository } from '../src/modules/dashboard/dashboard-widget.repository';
import { UserStatisticsRepository } from '../src/modules/user-statistics/user-statistics.repository';
import {
  authHeader,
  closeAuthorizationMatrixE2EContext,
  createAuthorizationMatrixE2EContext,
  createLibraryWithFolder,
  createReadingSession,
  createUserAndLogin,
  grantLibraryAccess,
  type AuthorizationMatrixE2EContext,
  type CreatedLibrary,
  type TestUserSession,
} from './e2e/authorization-matrix/authorization-matrix-harness';

const SCENARIO_TIMEOUT_MS = 60_000;

let inoSequence = 950_000;

describe('Count each series as one book (e2e)', { timeout: SCENARIO_TIMEOUT_MS }, () => {
  let ctx!: AuthorizationMatrixE2EContext;
  let reader!: TestUserSession;
  let serialLibrary!: CreatedLibrary;
  let novelLibrary!: CreatedLibrary;
  let widgets!: DashboardWidgetRepository;
  let userStats!: UserStatisticsRepository;
  let achievements!: AchievementRepository;
  let chapters!: Array<{ bookId: number; bookFileId: number }>;

  const today = new Date().toISOString().slice(0, 10);

  async function createSeries(name: string): Promise<number> {
    const [series] = await ctx.db
      .insert(schema.bookSeries)
      .values({ name, normalizedName: `${name.toLowerCase()} ${randomUUID()}` })
      .returning({ id: schema.bookSeries.id });
    return series!.id;
  }

  async function seedBook(
    library: CreatedLibrary,
    title: string,
    seriesId: number | null,
    pageCount: number | null = null,
  ): Promise<{ bookId: number; bookFileId: number }> {
    const slug = `${title.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}`;
    const [book] = await ctx.db
      .insert(schema.books)
      .values({
        libraryId: library.libraryId,
        libraryFolderId: library.libraryFolderId,
        folderPath: `${library.folderPath}/${slug}`,
        status: 'present',
      })
      .returning({ id: schema.books.id });
    await ctx.db.insert(schema.bookMetadata).values({ bookId: book!.id, title, seriesId, pageCount });
    inoSequence += 1;
    const [file] = await ctx.db
      .insert(schema.bookFiles)
      .values({
        bookId: book!.id,
        libraryFolderId: library.libraryFolderId,
        absolutePath: `${library.folderPath}/${slug}/${slug}.epub`,
        relPath: `${slug}/${slug}.epub`,
        ino: BigInt(inoSequence),
        sizeBytes: 2048,
        format: 'epub',
        role: 'content',
      })
      .returning({ id: schema.bookFiles.id });
    return { bookId: book!.id, bookFileId: file!.id };
  }

  async function finish(book: { bookId: number; bookFileId: number }, completedAt: Date): Promise<void> {
    await ctx.db
      .insert(schema.userBookStatus)
      .values({ userId: reader.userId, bookId: book.bookId, status: 'read', source: 'manual', finishedAt: completedAt });
    await ctx.db.insert(schema.readingAttempts).values({
      userId: reader.userId,
      bookId: book.bookId,
      endedOn: today,
      outcome: 'completed',
      origin: 'manual',
    });
    await createReadingSession(ctx, {
      userId: reader.userId,
      bookId: book.bookId,
      bookFileId: book.bookFileId,
      startedAt: new Date(completedAt.getTime() - 60_000),
      endedAt: completedAt,
      progressDelta: 100,
      endProgress: 100,
    });
  }

  async function setCountSeriesAsOneBook(library: CreatedLibrary, value: boolean): Promise<void> {
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/libraries/${library.libraryId}`,
      headers: authHeader(ctx.adminToken),
      payload: { countSeriesAsOneBook: value },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect((response.json() as { countSeriesAsOneBook: boolean }).countSeriesAsOneBook).toBe(value);
  }

  function libraryIds(): number[] {
    return [serialLibrary.libraryId, novelLibrary.libraryId];
  }

  beforeAll(async () => {
    ctx = await createAuthorizationMatrixE2EContext();
    widgets = ctx.app.get(DashboardWidgetRepository);
    userStats = ctx.app.get(UserStatisticsRepository);
    achievements = ctx.app.get(AchievementRepository);

    serialLibrary = await createLibraryWithFolder(ctx, { name: `serials-${randomUUID()}` });
    novelLibrary = await createLibraryWithFolder(ctx, { name: `novels-${randomUUID()}` });
    await ctx.db
      .update(schema.libraries)
      .set({ icon: 'BookOpen' })
      .where(inArray(schema.libraries.id, [serialLibrary.libraryId, novelLibrary.libraryId]));
    reader = await createUserAndLogin(ctx);
    await grantLibraryAccess(ctx, reader.userId, serialLibrary.libraryId);
    await grantLibraryAccess(ctx, reader.userId, novelLibrary.libraryId);

    const serial = await createSeries('Harbor Watch');
    const trilogy = await createSeries('Glass Trilogy');

    // Serial library: three chapters of one serial finished, one unread, plus a standalone book.
    chapters = await Promise.all([1, 2, 3, 4].map((n) => seedBook(serialLibrary, `Harbor Watch ${n}`, serial, 20)));
    const [author] = await ctx.db
      .insert(schema.authors)
      .values({ name: `Harbor Author ${randomUUID()}` })
      .returning({ id: schema.authors.id });
    await ctx.db.insert(schema.bookAuthors).values(chapters.map((chapter) => ({ bookId: chapter.bookId, authorId: author!.id })));
    const standalone = await seedBook(serialLibrary, 'Lighthouse Notes', null);
    // Novel library keeps per-book counting: two finished books of one series.
    const glass = await Promise.all([1, 2].map((n) => seedBook(novelLibrary, `Glass ${n}`, trilogy)));

    await finish(chapters[0]!, new Date('2025-12-10T12:00:00Z'));
    await finish(chapters[1]!, new Date('2026-02-10T12:00:00Z'));
    await finish(chapters[2]!, new Date('2026-02-20T12:00:00Z'));
    await finish(standalone, new Date('2026-02-15T12:00:00Z'));
    await finish(glass[0]!, new Date('2026-02-11T12:00:00Z'));
    await finish(glass[1]!, new Date('2026-02-12T12:00:00Z'));
  });

  afterAll(async () => {
    await closeAuthorizationMatrixE2EContext(ctx);
  });

  it('counts every book while the setting is off', async () => {
    await expect(widgets.getCompletedBooksThisYear(reader.userId, libraryIds())).resolves.toBe(6);
    await expect(achievements.countFinishedBooks(reader.userId)).resolves.toBe(6);
    const summary = await userStats.getSummary(reader.userId, false, libraryIds());
    expect(summary.completedBooks).toBe(6);
    expect(summary.trackedBooks).toBe(6);
  });

  it('collapses a finished series into one book in goals, statistics and achievements when on', async () => {
    await setCountSeriesAsOneBook(serialLibrary, true);

    // One serial + one standalone from the serial library, two books from the per-book library.
    await expect(widgets.getCompletedBooksThisYear(reader.userId, libraryIds())).resolves.toBe(4);
    await expect(achievements.countFinishedBooks(reader.userId)).resolves.toBe(4);

    const dayBefore = new Date(Date.now() - 86_400_000);
    const dayAfter = new Date(Date.now() + 86_400_000);
    await expect(achievements.countBooksFinishedInDateRange(reader.userId, dayBefore, dayAfter)).resolves.toBe(4);
    await expect(achievements.hasMonthWithBooksFinished(reader.userId, 4)).resolves.toBe(true);
    await expect(achievements.hasMonthWithBooksFinished(reader.userId, 5)).resolves.toBe(false);

    const summary = await userStats.getSummary(reader.userId, false, libraryIds());
    expect(summary.completedBooks).toBe(4);
    expect(summary.trackedBooks).toBe(4);
  });

  it('places a serial once per calendar year in the completion timeline', async () => {
    const lastYear = Number(today.slice(0, 4)) - 1;
    const thisMonth = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
    const extra = await ctx.db
      .insert(schema.readingAttempts)
      .values(
        [`${lastYear}-02-10`, `${lastYear}-03-20`].map((endedOn, index) => ({
          userId: reader.userId,
          bookId: chapters[index]!.bookId,
          endedOn,
          outcome: 'completed' as const,
          origin: 'manual' as const,
        })),
      )
      .returning({ id: schema.readingAttempts.id });

    try {
      // Last year: two chapters of the serial in two months count once, in the first month. This
      // year: the serial again, the standalone, and both per-book novels.
      await expect(userStats.getActivityCompletionTimeline(reader.userId, libraryIds())).resolves.toEqual([
        { year: lastYear, month: 2, count: 1 },
        { ...thisMonth, count: 4 },
      ]);
    } finally {
      const extraIds = extra.map((row) => row.id);
      await ctx.db.delete(schema.readingAttempts).where(inArray(schema.readingAttempts.id, extraIds));
    }
  });

  it('counts a serial once in dashboard book-count widgets and per-author achievements', async () => {
    const ids = libraryIds();
    const challenge = await widgets.getChallengePatternData(reader.userId, ids, new Date('2026-02-01T00:00:00Z'), new Date('2025-08-01T00:00:00Z'));
    expect(challenge.totalBooksRead).toBe(4);
    expect(challenge.topAuthorBookCount).toBe(1);

    const projection = await widgets.getYearProjectionData(reader.userId, ids, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    expect(projection.booksCompletedYtd).toBe(4);
    expect(projection.booksCompletedLast30Days).toBe(4);

    await expect(widgets.getReadingDnaData(reader.userId, ids, new Date('2025-01-01T00:00:00Z'))).resolves.toMatchObject({ totalBooks: 4 });
    await expect(widgets.getDiversityData(reader.userId, ids)).resolves.toMatchObject({ totalBooksRead: 4 });

    await expect(achievements.maxBooksPerAuthor(reader.userId)).resolves.toBe(1);
    await expect(achievements.countFinishedBooksByMaxPageCount(reader.userId, 100)).resolves.toBe(1);
    await expect(userStats.getCompletionTimeline(reader.userId, false, ids, 1825)).resolves.toEqual([
      { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), count: 4 },
    ]);
  });

  it('adds a serial read across several months to the goal line once', async () => {
    const ids = libraryIds();
    const earlier = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    earlier.setUTCMonth(earlier.getUTCMonth() - 1);
    const earlierMonth = { year: earlier.getUTCFullYear(), month: earlier.getUTCMonth() + 1 };
    const thisMonth = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
    const [extra] = await ctx.db
      .insert(schema.readingAttempts)
      .values({
        userId: reader.userId,
        bookId: chapters[3]!.bookId,
        endedOn: earlier.toISOString().slice(0, 10),
        outcome: 'completed',
        origin: 'manual',
      })
      .returning({ id: schema.readingAttempts.id });

    try {
      // Per-month chart: the serial shows up in both months it was read.
      await expect(userStats.getCompletionTimeline(reader.userId, false, ids, 365)).resolves.toEqual([
        { ...earlierMonth, count: 1 },
        { ...thisMonth, count: 4 },
      ]);
      // Cumulative goal line: the serial is placed only in its first month.
      await expect(userStats.getMonthlyCompletions(reader.userId, false, ids, 365)).resolves.toEqual([
        { ...earlierMonth, count: 1 },
        { ...thisMonth, count: 3 },
      ]);
    } finally {
      await ctx.db.delete(schema.readingAttempts).where(eq(schema.readingAttempts.id, extra!.id));
    }
  });

  it('leaves the per-book counting of other libraries untouched', async () => {
    await expect(widgets.getCompletedBooksThisYear(reader.userId, [novelLibrary.libraryId])).resolves.toBe(2);
    await setCountSeriesAsOneBook(serialLibrary, false);
    await expect(widgets.getCompletedBooksThisYear(reader.userId, libraryIds())).resolves.toBe(6);
  });
});
