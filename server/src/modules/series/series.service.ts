import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  BooksPage,
  SeriesBooksPage,
  SeriesContinueTarget,
  SeriesDetail,
  SeriesFollowResponse,
  SeriesMarkReadResponse,
  SeriesNextBookResponse,
  SeriesPage,
  SeriesSummary,
} from '@bookorbit/types';
import { READER_OPENABLE_FORMATS, SERIES_GAP_PREVIEW_LIMIT, getOpenableFormatsForGroup } from '@bookorbit/types';
import { MAX_OFFSET_ROWS, isOffsetWithinLimit } from '../../common/constants/pagination.constants';
import type { RequestUser } from '../../common/types/request-user';
import { normalizeSeriesTotalBooks } from '../../common/utils/series-total-books.utils';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { assembleBookCards } from '../book/utils/assemble-book-cards';
import { BookReadService } from '../book/book-read.service';
import { BookService } from '../book/book.service';
import { LibraryService } from '../library/library.service';
import { FindNextSeriesBookDto } from './dto/find-next-series-book.dto';
import { ListSeriesBooksDto } from './dto/list-series-books.dto';
import { ListSeriesDto } from './dto/list-series.dto';
import { MarkSeriesReadDto } from './dto/mark-series-read.dto';
import { SeriesRepository, type SeriesContinueRow } from './series.repository';
import { computeSeriesGaps } from './utils/series-gaps.utils';
import { buildVolumeLadder } from './utils/series-ladder.utils';

@Injectable()
export class SeriesService {
  private readonly logger = new Logger(SeriesService.name);

  constructor(
    private readonly seriesRepo: SeriesRepository,
    private readonly bookReadService: BookReadService,
    private readonly libraryService: LibraryService,
    private readonly bookService: BookService,
  ) {}

  private assertPaginationWindow(page: number, size: number): void {
    if (!isOffsetWithinLimit(page * size)) {
      throw new BadRequestException(`pagination window is too deep; page * size must be <= ${MAX_OFFSET_ROWS}`);
    }
  }

  async findAll(user: RequestUser, dto: ListSeriesDto): Promise<SeriesPage> {
    const page = dto.page ?? 0;
    const size = dto.size ?? 50;
    this.assertPaginationWindow(page, size);

    const libraryIds = await this.resolveLibraryIds(user, dto.libraryId);
    if (libraryIds.length === 0) {
      return { items: [], total: 0, page, size, facets: { all: 0, notStarted: 0, inProgress: 0, complete: 0, hasGaps: 0 } };
    }

    const result = await this.seriesRepo.findPage({
      q: dto.q,
      page,
      size,
      sort: dto.sort ?? 'name',
      order: dto.order ?? 'asc',
      libraryIds,
      userId: user.id,
      completionStatus: dto.completionStatus,
      author: dto.author,
      contentFilters: user.isSuperuser ? undefined : user.contentFilters,
    });

    const items: SeriesSummary[] = result.items.map((row) => {
      const ladder = buildVolumeLadder({
        members: row.members,
        truncated: row.membersTruncated,
        bookCount: row.bookCount,
        expectedBookCount: row.expectedBookCount,
      });

      return {
        id: row.id,
        name: row.name,
        bookCount: row.bookCount,
        readCount: row.readCount,
        readingCount: row.readingCount,
        authors: row.authors,
        coverBookIds: row.coverBookIds,
        lastAddedAt: row.lastAddedAt ?? null,
        libraryNames: row.libraryNames,
        expectedBookCount: normalizeSeriesTotalBooks(row.expectedBookCount) ?? null,
        volumes: ladder.volumes,
        volumesTruncated: ladder.truncated,
        gaps: ladder.gaps.slice(0, SERIES_GAP_PREVIEW_LIMIT),
        gapCount: ladder.gaps.length,
        nextBookId: row.next?.bookId ?? null,
        nextIndex: row.next?.seriesIndex ?? null,
        nextTitle: row.next?.title ?? null,
        nextStatus: row.next ? toNextStatus(row.next.status) : null,
        following: row.following,
      };
    });

    return { items, total: result.total, facets: result.facets, page: result.page, size: result.size };
  }

  /** Total series the user can browse; matches the unfiltered total of {@link findAll}. */
  async countAll(user: RequestUser): Promise<number> {
    const libraryIds = await this.libraryService.findAccessibleLibraryIds(user);
    if (libraryIds.length === 0) return 0;
    return this.seriesRepo.countSeries({ libraryIds, contentFilters: user.isSuperuser ? undefined : user.contentFilters });
  }

  async findBooks(user: RequestUser, seriesId: number, dto: ListSeriesBooksDto): Promise<SeriesBooksPage> {
    const page = dto.page ?? 0;
    const size = dto.size ?? 50;
    this.assertPaginationWindow(page, size);

    const libraryIds = await this.resolveLibraryIds(user, dto.libraryId);
    if (libraryIds.length === 0) {
      throw new NotFoundException('Series not found');
    }

    const contentFilters = user.isSuperuser ? undefined : user.contentFilters;
    const [detail, bookPage, continueRow, unfollowedIds] = await Promise.all([
      this.seriesRepo.findDetail({ seriesId, userId: user.id, libraryIds, contentFilters }),
      this.seriesRepo.findBookIds({
        seriesId,
        page,
        size,
        sort: dto.sort ?? 'seriesIndex',
        order: dto.order ?? 'asc',
        libraryIds,
        userId: user.id,
        readState: dto.readState,
        anchorBookId: dto.anchorBookId,
        contentFilters,
      }),
      this.seriesRepo.findContinueTarget({ seriesId, userId: user.id, libraryIds, formats: [...READER_OPENABLE_FORMATS], contentFilters }),
      this.seriesRepo.findUnfollowedSeriesIds(user.id, [seriesId]),
    ]);
    const following = !unfollowedIds.has(seriesId);

    if (!detail) {
      if (dto.libraryId) {
        const allLibraryIds = await this.resolveLibraryIds(user);
        const existsInAnyLibrary = await this.seriesRepo.findDetail({
          seriesId,
          userId: user.id,
          libraryIds: allLibraryIds,
          contentFilters: user.isSuperuser ? undefined : user.contentFilters,
        });
        if (existsInAnyLibrary) {
          const emptyInfo: SeriesDetail = {
            id: existsInAnyLibrary.id,
            name: existsInAnyLibrary.name,
            bookCount: 0,
            readCount: 0,
            readingCount: 0,
            authors: existsInAnyLibrary.authors,
            possibleGaps: [],
            expectedBookCount: existsInAnyLibrary.expectedBookCount ?? null,
            next: null,
            following,
          };
          return { items: [], total: 0, page, size, seriesInfo: emptyInfo };
        }
      }
      throw new NotFoundException('Series not found');
    }

    const possibleGaps = computeSeriesGaps(detail.indices, detail.bookCount, detail.expectedBookCount);

    let items: BooksPage['items'] = [];
    if (bookPage.bookIds.length > 0) {
      const cardData = await this.bookReadService.findCardsByBookIds(bookPage.bookIds, user.id);
      const cards = assembleBookCards(
        cardData.rows,
        cardData.authorRows,
        cardData.fileRows,
        cardData.genreRows,
        cardData.progressRows,
        cardData.statusRows,
        cardData.narratorRows,
        cardData.tagRows,
        cardData.seriesMembershipRows,
      );
      const orderMap = new Map(bookPage.bookIds.map((id, i) => [id, i]));
      items = cards
        .map((card) => {
          const contextualSeries = (card.seriesMemberships ?? []).find((membership) => membership.seriesId === seriesId);
          return contextualSeries
            ? {
                ...card,
                seriesId: contextualSeries.seriesId,
                seriesName: contextualSeries.seriesName,
                seriesIndex: contextualSeries.seriesIndex,
              }
            : card;
        })
        .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    }

    const seriesInfo: SeriesDetail = {
      id: detail.id,
      name: detail.name,
      bookCount: detail.bookCount,
      readCount: detail.readCount,
      readingCount: detail.readingCount,
      authors: detail.authors,
      possibleGaps,
      expectedBookCount: detail.expectedBookCount ?? null,
      next: toContinueTarget(continueRow),
      following,
    };

    return { items, total: bookPage.total, page: bookPage.page, size, seriesInfo };
  }

  /**
   * Backs the reader's end-of-book handoff. A neighbour the user cannot see, a book with no
   * readable file, and a book outside any series all resolve to null rather than an error, so
   * the reader can ask about every book it opens.
   */
  async findNextBook(user: RequestUser, seriesId: number, bookId: number, dto: FindNextSeriesBookDto): Promise<SeriesNextBookResponse> {
    const libraryIds = await this.resolveLibraryIds(user);
    if (libraryIds.length === 0) return { next: null };

    const row = await this.seriesRepo.findNextReadableBook({
      seriesId,
      bookId,
      libraryIds,
      formats: dto.formatGroup ? getOpenableFormatsForGroup(dto.formatGroup) : [...READER_OPENABLE_FORMATS],
      contentFilters: user.isSuperuser ? undefined : user.contentFilters,
    });

    if (!row?.format) return { next: null };

    return {
      next: {
        bookId: row.bookId,
        fileId: row.fileId,
        format: row.format,
        title: row.title,
        seriesIndex: row.seriesIndex,
      },
    };
  }

  /**
   * Marks a series read, or only its books numbered up to `upToIndex`, so a reader catching up on
   * a long serial does not tick chapters one by one. Books already read are left alone, which keeps
   * their finish dates.
   */
  async markRead(user: RequestUser, seriesId: number, dto: MarkSeriesReadDto): Promise<SeriesMarkReadResponse> {
    const event = 'series.mark_read';
    const startedAt = Date.now();
    const upToIndex = dto.upToIndex ?? 'all';
    this.logger.log(
      `[${event}] [start] seriesId=${seriesId} userId=${user.id} upToIndex=${upToIndex} libraryId=${dto.libraryId ?? 'all'} - mark series read started`,
    );
    try {
      const libraryIds = await this.resolveLibraryIds(user, dto.libraryId);
      if (libraryIds.length === 0) throw new NotFoundException('Series not found');

      const bookIds = await this.seriesRepo.findUnreadBookIds({
        seriesId,
        userId: user.id,
        libraryIds,
        upToIndex: dto.upToIndex,
        contentFilters: user.isSuperuser ? undefined : user.contentFilters,
      });
      if (bookIds.length > 0) await this.bookService.bulkSetStatus(bookIds, 'read', user);

      this.logger.log(
        `[${event}] [end] seriesId=${seriesId} userId=${user.id} upToIndex=${upToIndex} durationMs=${Date.now() - startedAt} updated=${bookIds.length} - mark series read completed`,
      );
      return { updated: bookIds.length };
    } catch (err) {
      const errorClass = err instanceof Error ? err.constructor.name : 'UnknownError';
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[${event}] [fail] seriesId=${seriesId} userId=${user.id} durationMs=${Date.now() - startedAt} errorClass=${errorClass} error="${sanitizeLogValue(message)}" - mark series read failed`,
      );
      throw err;
    }
  }

  /**
   * Follows or unfollows a series for this user. Only series the user can see are accepted, so
   * the endpoint cannot be used to probe which series exist in libraries they cannot open.
   */
  async setFollowing(user: RequestUser, seriesId: number, following: boolean): Promise<SeriesFollowResponse> {
    const startedAt = Date.now();
    const libraryIds = await this.resolveLibraryIds(user);
    const visible = await this.seriesRepo.isSeriesVisible({
      seriesId,
      libraryIds,
      contentFilters: user.isSuperuser ? undefined : user.contentFilters,
    });
    if (!visible) throw new NotFoundException('Series not found');

    await this.seriesRepo.setFollowing(user.id, seriesId, following);
    this.logger.log(
      `[series.set_following] [end] seriesId=${seriesId} userId=${user.id} following=${following} durationMs=${Date.now() - startedAt} - series follow state updated`,
    );
    return { seriesId, following };
  }

  private async resolveLibraryIds(user: RequestUser, scopedLibraryId?: number): Promise<number[]> {
    const libraries = await this.libraryService.findAll(user);
    const accessibleIds = libraries.map((library) => library.id);

    if (!scopedLibraryId) return accessibleIds;
    return accessibleIds.includes(scopedLibraryId) ? [scopedLibraryId] : [];
  }
}

function toNextStatus(status: string | null): 'reading' | 'unread' {
  return status === 'reading' ? 'reading' : 'unread';
}

function toContinueTarget(row: SeriesContinueRow | null): SeriesContinueTarget | null {
  if (!row) return null;
  return {
    bookId: row.bookId,
    title: row.title,
    seriesIndex: row.seriesIndex,
    status: toNextStatus(row.status),
    fileId: row.fileId,
    format: row.format,
  };
}
