import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import { DashboardRepository, groupRecentlyAddedRows } from './dashboard.repository';
import { audiobookProgress, bookFiles, books, readingProgress, userBookStatus } from '../../db/schema';

function makeLimitChain<T>(rows: T) {
  const chain: Record<string, vi.Mock> = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
}

function makeBoundsChain(minId: number | null, maxId: number | null) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockResolvedValue([{ minId, maxId }]);
  return chain;
}

function collectValues(value: unknown, seen = new WeakSet<object>()): unknown[] {
  if (value === null || typeof value !== 'object') return [value];
  if (seen.has(value)) return [];
  seen.add(value);

  const values: unknown[] = [];
  if ('value' in value) values.push((value as { value: unknown }).value);
  for (const key of Object.getOwnPropertyNames(value)) {
    values.push(...collectValues((value as Record<string, unknown>)[key], seen));
  }
  return values;
}

function compileSql(value: unknown): string {
  return new PgDialect()
    .sqlToQuery(value as SQL)
    .sql.replaceAll(/\s+/g, ' ')
    .trim();
}

describe('DashboardRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('returns empty results without querying when no libraries are accessible', async () => {
    const db = { select: vi.fn(), execute: vi.fn() };
    const repo = new DashboardRepository(db as never);

    await expect(repo.findRecentlyAddedBookIds([], 1, 20)).resolves.toEqual([]);
    await expect(repo.findContinueReadingBookIds([], 1, 20)).resolves.toEqual([]);
    await expect(repo.findContinueListeningBookIds([], 1, 20)).resolves.toEqual([]);
    await expect(repo.findWantToReadBookIds([], 1, 20)).resolves.toEqual([]);
    await expect(repo.findUpNextInSeriesBookIds([], 1, 20)).resolves.toEqual([]);
    await expect(repo.findRandomBookIds([], 1, 20)).resolves.toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('maps recently added rows to id list', async () => {
    const listChain = makeLimitChain([{ id: 5 }, { id: 2 }]);
    const db = { select: vi.fn().mockReturnValue(listChain) };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findRecentlyAddedBookIds([10], 3, 2);

    expect(result).toEqual([5, 2]);
    expect(listChain.limit).toHaveBeenCalledWith(2);
    const where = compileSql(listChain.where.mock.calls[0]?.[0]);
    expect(where).toContain('not exists ( select 1 from "user_unfollowed_series"');
    expect(collectValues(listChain.where.mock.calls[0]?.[0])).toContain(3);
  });

  it('groups recently added rows by series and orders each group by series index', () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));
    const groups = groupRecentlyAddedRows(
      [
        { id: 30, seriesId: 4, seriesIndex: '12', addedAt: at(9) },
        { id: 29, seriesId: 4, seriesIndex: '10', addedAt: at(8) },
        { id: 12, seriesId: null, seriesIndex: null, addedAt: at(7) },
        { id: 28, seriesId: 4, seriesIndex: '11', addedAt: at(6) },
        { id: 40, seriesId: 5, seriesIndex: '2', addedAt: at(5) },
        { id: 30, seriesId: 4, seriesIndex: '12', addedAt: at(9) },
        { id: 41, seriesId: 6, seriesIndex: '1', addedAt: at(4) },
      ],
      3,
    );

    expect(groups).toEqual([
      { bookId: 29, seriesId: 4, bookIds: [29, 28, 30], latestAddedAt: at(9) },
      { bookId: 12, seriesId: null, bookIds: [12], latestAddedAt: at(7) },
      { bookId: 40, seriesId: 5, bookIds: [40], latestAddedAt: at(5) },
    ]);
  });

  it('pages past a series that fills the first recently added page', async () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: 1000 - index,
      seriesId: 4,
      seriesIndex: String(900 - index),
      addedAt: at(59),
      addedAtKey: '2026-01-01 00:59:00.123456+00',
    }));
    const secondPage = [{ id: 7, seriesId: null, seriesIndex: null, addedAt: at(1), addedAtKey: '2026-01-01 00:01:00+00' }];
    const firstChain = makeLimitChain(firstPage);
    const secondChain = makeLimitChain(secondPage);
    const db = { select: vi.fn().mockReturnValueOnce(firstChain).mockReturnValueOnce(secondChain) };
    const repo = new DashboardRepository(db as never);

    const groups = await repo.findRecentlyAddedGroups([10], 3, 2);
    const secondWhere = compileSql(secondChain.where.mock.calls[0]?.[0]);

    expect(groups.map((group) => [group.bookId, group.bookIds.length])).toEqual([
      [901, 100],
      [7, 1],
    ]);
    expect(firstChain.limit).toHaveBeenCalledWith(100);
    expect(secondWhere).toContain('::timestamptz');
    expect(secondWhere).toContain('not in');
    expect(compileSql(firstChain.where.mock.calls[0]?.[0])).toContain('"user_unfollowed_series"."series_id" = "book_metadata"."series_id"');
    expect(collectValues(secondChain.where.mock.calls[0]?.[0])).toEqual(expect.arrayContaining(['2026-01-01 00:59:00.123456+00', 4]));
  });

  it('maps continue-reading rows to id list and requires a reading or rereading status', async () => {
    const listChain = makeLimitChain([{ id: 40 }, { id: 9 }]);
    const db = { select: vi.fn().mockReturnValue(listChain) };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findContinueReadingBookIds([8], 55, 10);
    const whereArg = listChain.where.mock.calls[0]?.[0];
    const whereSql = compileSql(whereArg);
    const whereValues = collectValues(whereArg);

    expect(result).toEqual([40, 9]);
    expect(listChain.leftJoin).toHaveBeenCalledTimes(2);
    expect(listChain.leftJoin.mock.calls[0]?.[0]).toBe(bookFiles);
    expect(listChain.leftJoin.mock.calls[1]?.[0]).toBe(readingProgress);
    expect(listChain.innerJoin).toHaveBeenCalledTimes(1);
    expect(listChain.innerJoin.mock.calls[0]?.[0]).toBe(userBookStatus);
    expect(listChain.leftJoin.mock.calls.some((call) => call[0] === audiobookProgress)).toBe(false);
    expect(whereSql).toContain('"user_book_status"."status" in');
    expect(whereSql).not.toContain('"user_book_status"."book_id" is null');
    expect(whereValues).toEqual(expect.arrayContaining(['reading', 'rereading']));
    expect(listChain.orderBy).toHaveBeenCalledTimes(1);
    expect(listChain.limit).toHaveBeenCalledWith(10);
  });

  it('counts continue-reading books with the same status gate as the id query', async () => {
    const countChain = { from: vi.fn(), leftJoin: vi.fn(), innerJoin: vi.fn(), where: vi.fn() };
    countChain.from.mockReturnValue(countChain);
    countChain.leftJoin.mockReturnValue(countChain);
    countChain.innerJoin.mockReturnValue(countChain);
    countChain.where.mockResolvedValue([{ value: 3 }]);
    const listChain = makeLimitChain([]);
    const db = { select: vi.fn().mockReturnValueOnce(countChain).mockReturnValueOnce(listChain) };
    const repo = new DashboardRepository(db as never);

    await expect(repo.countContinueReadingBooks([8], 55)).resolves.toBe(3);
    await repo.findContinueReadingBookIds([8], 55, 10);

    expect(countChain.innerJoin.mock.calls[0]?.[0]).toBe(userBookStatus);
    expect(compileSql(countChain.where.mock.calls[0]?.[0])).toBe(compileSql(listChain.where.mock.calls[0]?.[0]));
  });

  it('maps continue-listening rows and excludes unread plus terminal read statuses', async () => {
    const listChain = makeLimitChain([{ id: 41 }, { id: 10 }]);
    const db = { select: vi.fn().mockReturnValue(listChain) };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findContinueListeningBookIds([8], 55, 10);
    const whereArg = listChain.where.mock.calls[0]?.[0];
    const whereValues = collectValues(whereArg);

    expect(result).toEqual([41, 10]);
    expect(listChain.innerJoin).toHaveBeenCalledTimes(2);
    expect(listChain.innerJoin.mock.calls[0]?.[0]).toBe(audiobookProgress);
    expect(listChain.innerJoin.mock.calls[1]?.[0]).toBe(bookFiles);
    expect(listChain.leftJoin).toHaveBeenCalledTimes(1);
    expect(listChain.leftJoin).toHaveBeenCalledWith(userBookStatus, expect.anything());
    expect(collectValues(listChain.leftJoin.mock.calls[0]?.[1])).toContain(55);
    expect(whereValues).toEqual(expect.arrayContaining(['unread', 'read', 'skimmed', 'abandoned']));
    expect(listChain.orderBy).toHaveBeenCalledTimes(1);
    expect(listChain.limit).toHaveBeenCalledWith(10);
  });

  it('maps want-to-read rows to id list and joins user status', async () => {
    const listChain = makeLimitChain([{ id: 77 }, { id: 12 }]);
    const db = { select: vi.fn().mockReturnValue(listChain) };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findWantToReadBookIds([12], 55, 6);

    expect(result).toEqual([77, 12]);
    expect(listChain.innerJoin).toHaveBeenCalledTimes(1);
    expect(listChain.innerJoin.mock.calls[0]?.[0]).toBe(userBookStatus);
    expect(listChain.leftJoin).not.toHaveBeenCalled();
    expect(listChain.orderBy).toHaveBeenCalledTimes(1);
    expect(listChain.limit).toHaveBeenCalledWith(6);
  });

  it('returns empty random ids when there are no candidates', async () => {
    const boundsChain = makeBoundsChain(1, 100);
    const listChain = makeLimitChain([]);
    const db = {
      select: vi.fn().mockReturnValueOnce(boundsChain).mockReturnValue(listChain),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findRandomBookIds([5], 7, 20);

    expect(result).toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(5);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(listChain.leftJoin).not.toHaveBeenCalled();
    expect(listChain.orderBy).toHaveBeenCalledTimes(2);
    expect(listChain.limit).toHaveBeenCalledTimes(2);
    expect(listChain.limit).toHaveBeenNthCalledWith(1, 20);
    expect(listChain.limit).toHaveBeenNthCalledWith(2, 20);
  });

  it('samples random rows from independent pivots and excludes active or finished read statuses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const boundsChain = makeBoundsChain(1, 100);
    const subqueryChain = makeLimitChain([]);
    const db = {
      select: vi.fn().mockReturnValueOnce(boundsChain).mockReturnValue(subqueryChain),
      execute: vi.fn().mockResolvedValue({
        rows: [
          { sampleIndex: 0, id: 21 },
          { sampleIndex: 1, id: 3 },
          { sampleIndex: 2, id: 15 },
        ],
      }),
    };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findRandomBookIds([5], 7, 3);
    const queryText = compileSql(db.execute.mock.calls[0]?.[0]);
    const statusWhereValues = collectValues(subqueryChain.where.mock.calls[1]?.[0]);

    expect(result).toEqual([21, 3, 15]);
    expect(db.select).toHaveBeenCalledTimes(3);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(subqueryChain.offset).toHaveBeenCalledTimes(2);
    expect(subqueryChain.offset).toHaveBeenNthCalledWith(1, 0);
    expect(subqueryChain.offset).toHaveBeenNthCalledWith(2, 0);
    expect(statusWhereValues).toEqual(expect.arrayContaining(['reading', 'rereading', 'on_hold', 'read', 'skimmed', 'abandoned']));
    expect(queryText).toContain('not exists');
    expect(queryText).not.toContain('left join "user_book_status"');
    expect(queryText).toContain('where forward_candidate.id is null');
    expect(queryText).toContain('order by "books"."id" desc');
    expect(queryText).toContain('from "book_metadata" self');
    expect(queryText).toContain('earlier.series_index collate "C"');
    expect(Math.random).toHaveBeenCalledTimes(9);
  });

  it('caps distributed candidate probes for large limits', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const boundsChain = makeBoundsChain(1, 1000);
    const subqueryChain = makeLimitChain([]);
    const db = {
      select: vi.fn().mockReturnValueOnce(boundsChain).mockReturnValue(subqueryChain),
      execute: vi.fn().mockResolvedValue({
        rows: Array.from({ length: 50 }, (_, index) => ({ sampleIndex: index, id: index + 1 })),
      }),
    };
    const repo = new DashboardRepository(db as never);

    await expect(repo.findRandomBookIds([5], 7, 50)).resolves.toHaveLength(50);

    expect(Math.random).toHaveBeenCalledTimes(60);
  });

  it('fills a sparse distributed sample from the nearest lower ids', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const boundsChain = makeBoundsChain(1, 100);
    const subqueryChain = makeLimitChain([]);
    const afterPivot = makeLimitChain([]);
    const beforePivot = makeLimitChain([{ id: 9 }, { id: 2 }]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(boundsChain)
        .mockReturnValueOnce(subqueryChain)
        .mockReturnValueOnce(subqueryChain)
        .mockReturnValueOnce(afterPivot)
        .mockReturnValueOnce(beforePivot),
      execute: vi.fn().mockResolvedValue({
        rows: [
          { sampleIndex: 0, id: 100 },
          { sampleIndex: 1, id: 100 },
          { sampleIndex: 2, id: 100 },
        ],
      }),
    };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findRandomBookIds([5], 7, 3);

    expect(result).toEqual([100, 9, 2]);
    expect(afterPivot.limit).toHaveBeenCalledWith(2);
    expect(beforePivot.limit).toHaveBeenCalledWith(2);
    expect(collectValues(afterPivot.orderBy.mock.calls[0]?.[0])).toContain(' asc');
    expect(collectValues(beforePivot.orderBy.mock.calls[0]?.[0])).toContain(' desc');
    expect(beforePivot.orderBy.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ queryChunks: expect.arrayContaining([books.id]) }));
  });

  it('returns empty random ids and does not query when limit is zero', async () => {
    const db = { select: vi.fn() };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findRandomBookIds([3, 4], 99, 0);

    expect(result).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('maps up-next-in-series rows to id list', async () => {
    const db = {
      select: vi.fn(),
      execute: vi.fn().mockResolvedValue({ rows: [{ id: 17 }, { id: 4 }] }),
    };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findUpNextInSeriesBookIds([9], 55, 10);

    expect(result).toEqual([17, 4]);
    expect(db.execute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(db.execute.mock.calls[0]?.[0] as SQL);
    expect(query.sql.replaceAll(/\s+/g, ' ')).toContain(
      'not exists ( select 1 from "user_unfollowed_series" where "user_unfollowed_series"."user_id" = $',
    );
    expect(query.params).toContain(55);
  });

  it('returns empty up-next-in-series ids and does not query when limit is zero', async () => {
    const db = {
      select: vi.fn(),
      execute: vi.fn(),
    };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findUpNextInSeriesBookIds([9], 55, 0);

    expect(result).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('returns empty up-next-in-series ids when query returns no rows', async () => {
    const db = {
      select: vi.fn(),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = new DashboardRepository(db as never);

    const result = await repo.findUpNextInSeriesBookIds([2], 101, 20);

    expect(result).toEqual([]);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
