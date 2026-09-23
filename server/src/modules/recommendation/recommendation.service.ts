import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  BookRecommendation,
  RelatedBookCard,
  RelatedSeriesCard,
  RelatedShelfItem,
  SeriesBookRecommendation,
  UnscopedBookRecommendation,
  UserBookStatus,
} from '@bookorbit/types';
import { normalizeCoverAspectRatio } from '@bookorbit/types';
import type { RequestUser } from '../../common/types/request-user';
import { BookEmbedderService } from '../embedding/book-embedder.service';
import { BookReadService } from '../book/book-read.service';
import { LibraryService } from '../library/library.service';
import { UserBookStatusService } from '../user-book-status/user-book-status.service';
import {
  AnnCandidate,
  AuthorBookRow,
  CandidateMetadata,
  CoverBookRow,
  RecommendationRepository,
  SeriesAggregateRow,
  TargetBookData,
} from './recommendation.repository';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';

const RECOMMENDATION_EVENT = 'book.recommendations';
const SERIES_BOOKS_EVENT = 'book.series_books';
const AUTHOR_BOOKS_EVENT = 'book.author_books';
const AUTHOR_SHELF_EVENT = 'book.author_shelf';
const SIMILAR_SHELF_EVENT = 'book.similar_shelf';
const MAX_RECOMMENDATIONS = 25;
const MAX_SIMILAR_SHELF_ITEMS = 15;
const MAX_AUTHOR_STANDALONE_BOOKS = 10;
/** Serial chapters crowd the nearest neighbours, so the series shelf looks further out before grouping. */
const SIMILAR_SHELF_CANDIDATE_LIMIT = 300;
const DEFAULT_RATING_PROXIMITY = 0.5;
const RATING_PROXIMITY_RANGE = 4;
const SCORE_WEIGHTS = {
  cosineSim: 0.5,
  authorSim: 0.1,
  genreTagSim: 0.25,
  seriesBonus: 0.1,
  ratingProximity: 0.05,
} as const;

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly recRepo: RecommendationRepository,
    private readonly bookReadService: BookReadService,
    private readonly libraryService: LibraryService,
    private readonly embedder: BookEmbedderService,
    private readonly userBookStatusService: UserBookStatusService,
  ) {}

  private async withReadStatus<T extends { id: number }>(rows: T[], userId: number): Promise<(T & { readStatus: UserBookStatus | null })[]> {
    const statuses = await this.userBookStatusService.findByBookIds(
      userId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({ ...row, readStatus: statuses.get(row.id) ?? null }));
  }

  async getRecommendations(bookId: number, user: RequestUser): Promise<BookRecommendation[]> {
    const startedAt = Date.now();
    this.logger.log(
      `[${RECOMMENDATION_EVENT}] [start] bookId=${bookId} userId=${user.id} isSuperuser=${user.isSuperuser} - recommendation lookup started`,
    );

    try {
      const libraryId = await this.bookReadService.findLibraryIdByBookId(bookId);
      if (libraryId === null) throw new NotFoundException(`Book ${bookId} not found`);
      await this.libraryService.verifyUserAccess(user.id, libraryId, user.isSuperuser);

      const target = (await this.recRepo.getTargetBookData(bookId)) ?? this.createFallbackTarget();
      const embedding = target.embedding ?? (await this.embedder.embedBook(bookId));
      if (!this.isValidEmbedding(embedding)) {
        this.logger.log(
          `[${RECOMMENDATION_EVENT}] [end] bookId=${bookId} userId=${user.id} libraryId=${libraryId} durationMs=${Date.now() - startedAt} reason=invalid_embedding - recommendation lookup completed`,
        );
        return [];
      }

      const accessibleLibraries = await this.libraryService.findAll(user);
      const accessibleLibraryIds = accessibleLibraries.map((library) => library.id);

      const candidates = await this.recRepo.findAnnCandidates(
        embedding,
        bookId,
        accessibleLibraryIds,
        user.isSuperuser ? undefined : user.contentFilters,
      );
      if (candidates.length === 0) {
        this.logger.log(
          `[${RECOMMENDATION_EVENT}] [end] bookId=${bookId} userId=${user.id} libraryId=${libraryId} durationMs=${Date.now() - startedAt} accessibleLibraryCount=${accessibleLibraryIds.length} candidateCount=0 resultCount=0 - recommendation lookup completed`,
        );
        return [];
      }

      const candidateMetadata = await this.recRepo.getCandidateMetadata(candidates.map((c) => c.bookId));
      const metaMap = new Map(candidateMetadata.map((m) => [m.bookId, m]));

      const rescored = candidates
        .map((candidate) => ({
          bookId: candidate.bookId,
          score: this.rescore(candidate, target, metaMap.get(candidate.bookId) ?? null),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECOMMENDATIONS);

      if (rescored.length === 0) {
        this.logger.log(
          `[${RECOMMENDATION_EVENT}] [end] bookId=${bookId} userId=${user.id} libraryId=${libraryId} durationMs=${Date.now() - startedAt} accessibleLibraryCount=${accessibleLibraryIds.length} candidateCount=${candidates.length} rescoredCount=0 resultCount=0 - recommendation lookup completed`,
        );
        return [];
      }

      const topIds = rescored.map((row) => row.bookId);
      const rows = await this.bookReadService.findRecommendationTitlesByBookIds(topIds);
      const rowMap = new Map(rows.map((row) => [row.id, row]));
      const ordered = rescored
        .map((rescoredCandidate) => rowMap.get(rescoredCandidate.bookId))
        .filter((row): row is UnscopedBookRecommendation => row != null);
      const recommendations = await this.withReadStatus(ordered, user.id);

      this.logger.log(
        `[${RECOMMENDATION_EVENT}] [end] bookId=${bookId} userId=${user.id} libraryId=${libraryId} durationMs=${Date.now() - startedAt} accessibleLibraryCount=${accessibleLibraryIds.length} candidateCount=${candidates.length} rescoredCount=${rescored.length} resultCount=${recommendations.length} - recommendation lookup completed`,
      );

      return recommendations;
    } catch (err) {
      const { errorClass, errorMessage } = this.parseError(err);
      this.logger.error(
        `[${RECOMMENDATION_EVENT}] [fail] bookId=${bookId} userId=${user.id} durationMs=${Date.now() - startedAt} errorClass=${errorClass} error="${errorMessage}" - recommendation lookup failed`,
      );
      throw err;
    }
  }

  async getSeriesBooks(bookId: number, user: RequestUser): Promise<SeriesBookRecommendation[]> {
    const startedAt = Date.now();
    this.logger.log(`[${SERIES_BOOKS_EVENT}] [start] bookId=${bookId} userId=${user.id} - series books lookup started`);

    try {
      const libraryId = await this.bookReadService.findLibraryIdByBookId(bookId);
      if (libraryId === null) throw new NotFoundException(`Book ${bookId} not found`);
      await this.libraryService.verifyUserAccess(user.id, libraryId, user.isSuperuser);

      const series = await this.recRepo.getSeriesIdentity(bookId);
      if (!series) {
        this.logger.log(
          `[${SERIES_BOOKS_EVENT}] [end] bookId=${bookId} durationMs=${Date.now() - startedAt} reason=no_series - series books lookup completed`,
        );
        return [];
      }

      const libraryIds = await this.libraryService.findAccessibleLibraryIds(user);
      const rows = await this.recRepo.findSeriesBooks(series.id, libraryIds, user.isSuperuser ? undefined : user.contentFilters, bookId);

      this.logger.log(
        `[${SERIES_BOOKS_EVENT}] [end] bookId=${bookId} durationMs=${Date.now() - startedAt} seriesId=${series.id} seriesName="${sanitizeLogValue(series.name ?? '')}" resultCount=${rows.length} - series books lookup completed`,
      );

      return this.withReadStatus(
        rows.map((r) => ({
          id: r.bookId,
          title: r.title,
          coverAspectRatio: normalizeCoverAspectRatio(r.coverAspectRatio),
          updatedAt: r.updatedAt?.toISOString() ?? null,
          seriesIndex: r.seriesIndex,
          hasCover: r.coverSource !== null,
          authors: r.authorNames,
          isAudiobook: r.isAudiobook,
          isComic: r.isComic,
        })),
        user.id,
      );
    } catch (err) {
      const { errorClass, errorMessage } = this.parseError(err);
      this.logger.error(
        `[${SERIES_BOOKS_EVENT}] [fail] bookId=${bookId} userId=${user.id} durationMs=${Date.now() - startedAt} errorClass=${errorClass} error="${errorMessage}" - series books lookup failed`,
      );
      throw err;
    }
  }

  async getAuthorBooks(bookId: number, user: RequestUser): Promise<BookRecommendation[]> {
    const startedAt = Date.now();
    this.logger.log(`[${AUTHOR_BOOKS_EVENT}] [start] bookId=${bookId} userId=${user.id} - author books lookup started`);

    try {
      const libraryId = await this.bookReadService.findLibraryIdByBookId(bookId);
      if (libraryId === null) throw new NotFoundException(`Book ${bookId} not found`);
      await this.libraryService.verifyUserAccess(user.id, libraryId, user.isSuperuser);

      const libraryIds = await this.libraryService.findAccessibleLibraryIds(user);
      const rows = await this.recRepo.findAuthorBooks(bookId, libraryIds, user.isSuperuser ? undefined : user.contentFilters);

      this.logger.log(
        `[${AUTHOR_BOOKS_EVENT}] [end] bookId=${bookId} durationMs=${Date.now() - startedAt} resultCount=${rows.length} - author books lookup completed`,
      );

      return this.withReadStatus(
        rows.map((r) => ({
          id: r.bookId,
          title: r.title,
          coverAspectRatio: normalizeCoverAspectRatio(r.coverAspectRatio),
          updatedAt: r.updatedAt?.toISOString() ?? null,
          hasCover: r.coverSource !== null,
          authors: r.authorNames,
          isAudiobook: r.isAudiobook,
          isComic: r.isComic,
        })),
        user.id,
      );
    } catch (err) {
      const { errorClass, errorMessage } = this.parseError(err);
      this.logger.error(
        `[${AUTHOR_BOOKS_EVENT}] [fail] bookId=${bookId} userId=${user.id} durationMs=${Date.now() - startedAt} errorClass=${errorClass} error="${errorMessage}" - author books lookup failed`,
      );
      throw err;
    }
  }

  /**
   * The book's authors' other work: one card per other series, then books with no series. The
   * book's own series is left out; it has its own shelf.
   */
  async getAuthorShelf(bookId: number, user: RequestUser): Promise<RelatedShelfItem[]> {
    const startedAt = Date.now();
    this.logger.log(`[${AUTHOR_SHELF_EVENT}] [start] bookId=${bookId} userId=${user.id} - author shelf lookup started`);

    try {
      const libraryId = await this.bookReadService.findLibraryIdByBookId(bookId);
      if (libraryId === null) throw new NotFoundException(`Book ${bookId} not found`);
      await this.libraryService.verifyUserAccess(user.id, libraryId, user.isSuperuser);

      const contentFilters = user.isSuperuser ? undefined : user.contentFilters;
      const [series, libraryIds] = await Promise.all([this.recRepo.getSeriesIdentity(bookId), this.libraryService.findAccessibleLibraryIds(user)]);
      const [seriesRows, standaloneRows] = await Promise.all([
        this.recRepo.findAuthorSeries(bookId, series?.id ?? null, libraryIds, user.id, contentFilters),
        this.recRepo.findAuthorBooks(bookId, libraryIds, contentFilters, { standaloneOnly: true, limit: MAX_AUTHOR_STANDALONE_BOOKS }),
      ]);

      const seriesCards = await this.toSeriesCards(seriesRows);
      const bookCards = await this.withReadStatus(
        standaloneRows.map((row) => this.toBookCard(row)),
        user.id,
      );

      this.logger.log(
        `[${AUTHOR_SHELF_EVENT}] [end] bookId=${bookId} userId=${user.id} durationMs=${Date.now() - startedAt} seriesCount=${seriesCards.length} standaloneCount=${bookCards.length} - author shelf lookup completed`,
      );
      return [...seriesCards, ...bookCards];
    } catch (err) {
      const { errorClass, errorMessage } = this.parseError(err);
      this.logger.error(
        `[${AUTHOR_SHELF_EVENT}] [fail] bookId=${bookId} userId=${user.id} durationMs=${Date.now() - startedAt} errorClass=${errorClass} error="${errorMessage}" - author shelf lookup failed`,
      );
      throw err;
    }
  }

  /**
   * Books like this one, grouped so each other series shows once, ranked by its closest book.
   * Books from the book's own series never appear.
   */
  async getSimilarShelf(bookId: number, user: RequestUser): Promise<RelatedShelfItem[]> {
    const startedAt = Date.now();
    this.logger.log(`[${SIMILAR_SHELF_EVENT}] [start] bookId=${bookId} userId=${user.id} - similar shelf lookup started`);

    try {
      const libraryId = await this.bookReadService.findLibraryIdByBookId(bookId);
      if (libraryId === null) throw new NotFoundException(`Book ${bookId} not found`);
      await this.libraryService.verifyUserAccess(user.id, libraryId, user.isSuperuser);

      const target = (await this.recRepo.getTargetBookData(bookId)) ?? this.createFallbackTarget();
      const embedding = target.embedding ?? (await this.embedder.embedBook(bookId));
      if (!this.isValidEmbedding(embedding)) {
        this.logger.log(
          `[${SIMILAR_SHELF_EVENT}] [end] bookId=${bookId} userId=${user.id} durationMs=${Date.now() - startedAt} reason=invalid_embedding resultCount=0 - similar shelf lookup completed`,
        );
        return [];
      }

      const contentFilters = user.isSuperuser ? undefined : user.contentFilters;
      const libraryIds = await this.libraryService.findAccessibleLibraryIds(user);
      const candidates = await this.recRepo.findAnnCandidates(embedding, bookId, libraryIds, contentFilters, {
        excludeSeriesId: target.seriesId,
        limit: SIMILAR_SHELF_CANDIDATE_LIMIT,
      });
      const groups = await this.rankCandidateGroups(candidates, target);

      const seriesIds = groups.filter((g) => g.seriesId != null).map((g) => g.seriesId!);
      const bookIds = groups.filter((g) => g.seriesId == null).map((g) => g.bookId);
      const [seriesRows, bookRows] = await Promise.all([
        this.recRepo.findSeriesAggregates(seriesIds, libraryIds, user.id, contentFilters),
        bookIds.length === 0 ? Promise.resolve([]) : this.bookReadService.findRecommendationTitlesByBookIds(bookIds),
      ]);
      const seriesCards = new Map((await this.toSeriesCards(seriesRows)).map((card) => [card.seriesId, card]));
      const bookCards = new Map(
        (await this.withReadStatus(bookRows, user.id)).map((row): [number, RelatedBookCard] => [row.id, { kind: 'book', ...row }]),
      );

      const items = groups
        .map((group) => (group.seriesId != null ? seriesCards.get(group.seriesId) : bookCards.get(group.bookId)))
        .filter((item): item is RelatedShelfItem => item != null);

      this.logger.log(
        `[${SIMILAR_SHELF_EVENT}] [end] bookId=${bookId} userId=${user.id} durationMs=${Date.now() - startedAt} candidateCount=${candidates.length} groupCount=${groups.length} resultCount=${items.length} - similar shelf lookup completed`,
      );
      return items;
    } catch (err) {
      const { errorClass, errorMessage } = this.parseError(err);
      this.logger.error(
        `[${SIMILAR_SHELF_EVENT}] [fail] bookId=${bookId} userId=${user.id} durationMs=${Date.now() - startedAt} errorClass=${errorClass} error="${errorMessage}" - similar shelf lookup failed`,
      );
      throw err;
    }
  }

  /** Candidates rescored and collapsed to one entry per series (standalone books stay single), best first. */
  private async rankCandidateGroups(
    candidates: AnnCandidate[],
    target: TargetBookData,
  ): Promise<Array<{ seriesId: number | null; bookId: number; score: number }>> {
    if (candidates.length === 0) return [];

    const metadata = await this.recRepo.getCandidateMetadata(candidates.map((c) => c.bookId));
    const metaMap = new Map(metadata.map((m) => [m.bookId, m]));
    const best = new Map<string, { seriesId: number | null; bookId: number; score: number }>();
    for (const candidate of candidates) {
      const score = this.rescore(candidate, target, metaMap.get(candidate.bookId) ?? null);
      const key = candidate.seriesId != null ? `s${candidate.seriesId}` : `b${candidate.bookId}`;
      const current = best.get(key);
      if (!current || score > current.score) best.set(key, { seriesId: candidate.seriesId, bookId: candidate.bookId, score });
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, MAX_SIMILAR_SHELF_ITEMS);
  }

  private async toSeriesCards(rows: SeriesAggregateRow[]): Promise<RelatedSeriesCard[]> {
    if (rows.length === 0) return [];
    const covers = new Map((await this.recRepo.findCoverBooks(rows.map((row) => row.coverBookId))).map((c) => [c.bookId, c]));
    return rows.map((row) => this.toSeriesCard(row, covers.get(row.coverBookId) ?? null));
  }

  private toSeriesCard(row: SeriesAggregateRow, cover: CoverBookRow | null): RelatedSeriesCard {
    return {
      kind: 'series',
      seriesId: row.seriesId,
      name: row.name,
      authors: cover?.authorNames ?? [],
      bookCount: row.bookCount,
      readCount: row.readCount,
      readingCount: row.readingCount,
      isSerial: row.isSerial,
      coverBookId: row.coverBookId,
      coverUpdatedAt: cover?.updatedAt?.toISOString() ?? null,
      hasCover: cover?.coverSource != null,
      coverAspectRatio: normalizeCoverAspectRatio(cover?.coverAspectRatio ?? null),
      isAudiobook: cover?.isAudiobook ?? false,
      isComic: cover?.isComic ?? false,
    };
  }

  private toBookCard(row: AuthorBookRow): UnscopedBookRecommendation & { kind: 'book' } {
    return {
      kind: 'book',
      id: row.bookId,
      title: row.title,
      coverAspectRatio: normalizeCoverAspectRatio(row.coverAspectRatio),
      updatedAt: row.updatedAt?.toISOString() ?? null,
      hasCover: row.coverSource !== null,
      authors: row.authorNames,
      isAudiobook: row.isAudiobook,
      isComic: row.isComic,
    };
  }

  private rescore(candidate: AnnCandidate, target: TargetBookData, meta: CandidateMetadata | null): number {
    const cosineSim = this.clamp01(candidate.cosineSim);

    const authorSim = meta ? this.jaccard(this.toNormalizedSet(target.authorNames), this.toNormalizedSet(meta.authorNames)) : 0;
    const genreTagSim = meta ? this.jaccard(this.toNormalizedSet(target.genreTagNames), this.toNormalizedSet(meta.genreTagNames)) : 0;

    const seriesBonus = target.seriesId != null && candidate.seriesId === target.seriesId ? 1.0 : 0.0;

    let ratingProximity = DEFAULT_RATING_PROXIMITY;
    if (target.rating != null && candidate.rating != null) {
      ratingProximity = this.clamp01(1 - Math.abs(target.rating - candidate.rating) / RATING_PROXIMITY_RANGE);
    }

    return (
      SCORE_WEIGHTS.cosineSim * cosineSim +
      SCORE_WEIGHTS.authorSim * authorSim +
      SCORE_WEIGHTS.genreTagSim * genreTagSim +
      SCORE_WEIGHTS.seriesBonus * seriesBonus +
      SCORE_WEIGHTS.ratingProximity * ratingProximity
    );
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const x of a) if (b.has(x)) intersection++;
    return intersection / (a.size + b.size - intersection);
  }

  private isValidEmbedding(embedding: number[] | null): embedding is number[] {
    return Array.isArray(embedding) && embedding.length > 0 && embedding.every((v) => Number.isFinite(v));
  }

  private toNormalizedSet(values: string[]): Set<string> {
    return new Set(values.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0));
  }

  private createFallbackTarget(): TargetBookData {
    return {
      embedding: null,
      seriesId: null,
      seriesName: null,
      rating: null,
      authorNames: [],
      genreTagNames: [],
    };
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private parseError(err: unknown): { errorClass: string; errorMessage: string } {
    if (err instanceof Error) {
      return { errorClass: err.constructor.name, errorMessage: sanitizeLogValue(err.message).slice(0, 200) };
    }
    return { errorClass: 'UnknownError', errorMessage: sanitizeLogValue(String(err)).slice(0, 200) };
  }
}
