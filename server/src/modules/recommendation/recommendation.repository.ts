import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, ne, and, isNotNull, isNull, or, sql, asc, desc, type SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { ContentFilterRules } from '@bookorbit/types';
import { isAudioFormat, isComicFormat } from '@bookorbit/types';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import {
  authors,
  bookAuthors,
  bookFiles,
  bookGenres,
  bookMetadata,
  bookSeries,
  bookTags,
  books,
  genres,
  libraries,
  tags,
  userBookStatus,
} from '../../db/schema';
import { buildContentFilterClauses } from '../../common/utils/content-filter-sql.utils';
import { seriesReadingOrderBy } from '../../common/utils/series-index-sql.utils';

type Db = NodePgDatabase<typeof schema>;
const ANN_CANDIDATE_FETCH_LIMIT = 100;
const SERIES_WINDOW_BEFORE = 5;
const SERIES_WINDOW_AFTER = 20;
const SERIES_BOOKS_LIMIT = SERIES_WINDOW_BEFORE + 1 + SERIES_WINDOW_AFTER;
const AUTHOR_BOOKS_LIMIT = 25;
const AUTHOR_SERIES_LIMIT = 20;

export interface SeriesBookRow {
  bookId: number;
  title: string | null;
  coverAspectRatio: string;
  updatedAt: Date | null;
  seriesIndex: string | null;
  coverSource: string | null;
  authorNames: string[];
  isAudiobook: boolean;
  isComic: boolean;
}

export interface AuthorBookRow {
  bookId: number;
  title: string | null;
  coverAspectRatio: string;
  updatedAt: Date | null;
  coverSource: string | null;
  authorNames: string[];
  isAudiobook: boolean;
  isComic: boolean;
}

export interface AnnCandidate {
  bookId: number;
  cosineSim: number;
  seriesId: number | null;
  seriesName: string | null;
  rating: number | null;
}

export interface CandidateMetadata {
  bookId: number;
  authorNames: string[];
  genreTagNames: string[];
}

export interface TargetBookData {
  embedding: number[] | null;
  seriesId: number | null;
  seriesName: string | null;
  rating: number | null;
  authorNames: string[];
  genreTagNames: string[];
}

export interface SeriesAggregateRow {
  seriesId: number;
  name: string;
  bookCount: number;
  readCount: number;
  readingCount: number;
  coverBookId: number;
  /** A library holding the series counts a series as one book, so its books are serial chapters. */
  isSerial: boolean;
}

export interface CoverBookRow {
  bookId: number;
  coverAspectRatio: string;
  updatedAt: Date | null;
  coverSource: string | null;
  authorNames: string[];
  isAudiobook: boolean;
  isComic: boolean;
}

export interface AnnCandidateOptions {
  /** Leaves out every book of this series, so the shelf only offers other series. */
  excludeSeriesId?: number | null;
  limit?: number;
}

export interface SeriesIdentity {
  id: number;
  name: string | null;
}

@Injectable()
export class RecommendationRepository {
  private iterativeIndexScanSupport: Promise<boolean> | null = null;

  constructor(@Inject(DB) private readonly db: Db) {}

  async getTargetBookData(bookId: number): Promise<TargetBookData | null> {
    const [meta] = await this.db
      .select({
        embedding: bookMetadata.embedding,
        seriesId: bookMetadata.seriesId,
        seriesName: bookMetadata.seriesName,
        rating: bookMetadata.rating,
      })
      .from(bookMetadata)
      .where(eq(bookMetadata.bookId, bookId))
      .limit(1);

    if (!meta) return null;

    const [candidateMetadata] = await this.getCandidateMetadata([bookId]);

    return {
      embedding: meta.embedding,
      seriesId: meta.seriesId,
      seriesName: meta.seriesName,
      rating: meta.rating,
      authorNames: candidateMetadata?.authorNames ?? [],
      genreTagNames: candidateMetadata?.genreTagNames ?? [],
    };
  }

  async getSeriesIdentity(bookId: number): Promise<SeriesIdentity | null> {
    const [row] = await this.db
      .select({ seriesId: bookMetadata.seriesId, seriesName: bookMetadata.seriesName })
      .from(bookMetadata)
      .where(eq(bookMetadata.bookId, bookId))
      .limit(1);

    if (row?.seriesId == null) return null;
    return { id: row.seriesId, name: row.seriesName?.trim() || null };
  }

  async findAnnCandidates(
    embedding: number[],
    targetBookId: number,
    libraryIds: number[],
    contentFilters?: ContentFilterRules,
    options: AnnCandidateOptions = {},
  ): Promise<AnnCandidate[]> {
    if (libraryIds.length === 0 || embedding.length === 0 || embedding.some((v) => !Number.isFinite(v))) return [];

    const vecStr = `[${embedding.join(',')}]`;
    const filterClauses = contentFilters ? buildContentFilterClauses(contentFilters, this.db) : [];
    const excludeSeriesId = options.excludeSeriesId;
    if (excludeSeriesId != null) {
      filterClauses.push(or(isNull(bookMetadata.seriesId), ne(bookMetadata.seriesId, excludeSeriesId))!);
    }

    const query = (executor: Pick<Db, 'select'>) =>
      executor
        .select({
          bookId: bookMetadata.bookId,
          cosineSim: sql<number>`(1 - (${bookMetadata.embedding} <=> ${vecStr}::vector))::float`,
          seriesId: bookMetadata.seriesId,
          seriesName: bookMetadata.seriesName,
          rating: bookMetadata.rating,
        })
        .from(bookMetadata)
        .innerJoin(books, eq(books.id, bookMetadata.bookId))
        .where(and(inArray(books.libraryId, libraryIds), ne(bookMetadata.bookId, targetBookId), isNotNull(bookMetadata.embedding), ...filterClauses))
        .orderBy(sql`${bookMetadata.embedding} <=> ${vecStr}::vector`)
        .limit(options.limit ?? ANN_CANDIDATE_FETCH_LIMIT);

    if (excludeSeriesId == null || !(await this.supportsIterativeIndexScan())) return query(this.db);

    // An HNSW scan stops after hnsw.ef_search neighbours and filters afterwards. A long serial fills the
    // whole neighbourhood of its own chapters, so excluding it would leave nothing without iterative scans.
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)`);
      return query(tx);
    });
  }

  /** pgvector added hnsw.iterative_scan in 0.8; setting it on older versions is an error. */
  private supportsIterativeIndexScan(): Promise<boolean> {
    this.iterativeIndexScanSupport ??= this.db
      .execute<{ extversion: string }>(sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`)
      .then((result) => pgvectorHasIterativeScan(result.rows[0]?.extversion))
      .catch(() => {
        this.iterativeIndexScanSupport = null;
        return false;
      });
    return this.iterativeIndexScanSupport;
  }

  async getCandidateMetadata(bookIds: number[]): Promise<CandidateMetadata[]> {
    if (bookIds.length === 0) return [];

    const [authorRows, genreRows, tagRows] = await Promise.all([
      this.db
        .select({ bookId: bookAuthors.bookId, name: authors.name })
        .from(bookAuthors)
        .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
        .where(inArray(bookAuthors.bookId, bookIds)),
      this.db
        .select({ bookId: bookGenres.bookId, name: genres.name })
        .from(bookGenres)
        .innerJoin(genres, eq(genres.id, bookGenres.genreId))
        .where(inArray(bookGenres.bookId, bookIds)),
      this.db
        .select({ bookId: bookTags.bookId, name: tags.name })
        .from(bookTags)
        .innerJoin(tags, eq(tags.id, bookTags.tagId))
        .where(inArray(bookTags.bookId, bookIds)),
    ]);

    const authorsByBook = this.groupNamesByBook(authorRows);
    const genreTagsByBook = this.groupNamesByBook([...genreRows, ...tagRows]);

    return bookIds.map((id) => ({
      bookId: id,
      authorNames: authorsByBook.get(id) ?? [],
      genreTagNames: genreTagsByBook.get(id) ?? [],
    }));
  }

  /**
   * Returns a window of the series in reading order. With an anchor book the window holds up to
   * SERIES_WINDOW_BEFORE entries ahead of it and SERIES_WINDOW_AFTER after it; near the start it
   * fills up with later entries. Long serials have far more entries than one window can show.
   */
  async findSeriesBooks(
    seriesId: number,
    libraryIds: number[],
    contentFilters?: ContentFilterRules,
    anchorBookId?: number,
  ): Promise<SeriesBookRow[]> {
    if (libraryIds.length === 0) return [];

    const filterClauses = contentFilters ? buildContentFilterClauses(contentFilters, this.db) : [];
    const scope = and(inArray(books.libraryId, libraryIds), eq(bookMetadata.seriesId, seriesId), ...filterClauses);
    const readingOrder = [
      ...seriesReadingOrderBy(bookMetadata.seriesIndex, bookMetadata.publishedDate, 'ASC'),
      asc(bookMetadata.title),
      asc(books.id),
    ];
    const offset = anchorBookId == null ? 0 : await this.findSeriesWindowOffset(scope, readingOrder, anchorBookId);

    const rows = await this.db
      .select({
        bookId: books.id,
        title: bookMetadata.title,
        coverAspectRatio: libraries.coverAspectRatio,
        updatedAt: books.updatedAt,
        seriesIndex: bookMetadata.seriesIndex,
        coverSource: bookMetadata.coverSource,
        primaryFormat: bookFiles.format,
      })
      .from(books)
      .innerJoin(libraries, eq(libraries.id, books.libraryId))
      .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
      .leftJoin(bookFiles, eq(bookFiles.id, books.primaryFileId))
      .where(scope)
      .orderBy(...readingOrder)
      .offset(offset)
      .limit(SERIES_BOOKS_LIMIT);

    const bookIds = rows.map((r) => r.bookId);
    const authorRows =
      bookIds.length === 0
        ? []
        : await this.db
            .select({ bookId: bookAuthors.bookId, name: authors.name })
            .from(bookAuthors)
            .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
            .where(inArray(bookAuthors.bookId, bookIds));

    const authorsByBook = this.groupNamesByBook(authorRows);

    return rows.map((r) => ({
      bookId: r.bookId,
      title: r.title,
      coverAspectRatio: r.coverAspectRatio,
      updatedAt: r.updatedAt ?? null,
      seriesIndex: r.seriesIndex,
      coverSource: r.coverSource,
      authorNames: authorsByBook.get(r.bookId) ?? [],
      isAudiobook: r.primaryFormat != null ? isAudioFormat(r.primaryFormat) : false,
      isComic: r.primaryFormat != null ? isComicFormat(r.primaryFormat) : false,
    }));
  }

  async findAuthorBooks(
    bookId: number,
    libraryIds: number[],
    contentFilters?: ContentFilterRules,
    options: { standaloneOnly?: boolean; limit?: number } = {},
  ): Promise<AuthorBookRow[]> {
    if (libraryIds.length === 0) return [];

    const authorIds = this.db.select({ authorId: bookAuthors.authorId }).from(bookAuthors).where(eq(bookAuthors.bookId, bookId));
    const filterClauses = contentFilters ? buildContentFilterClauses(contentFilters, this.db) : [];
    if (options.standaloneOnly) filterClauses.push(isNull(bookMetadata.seriesId));

    const rows = await this.db
      .select({
        bookId: books.id,
        title: bookMetadata.title,
        coverAspectRatio: libraries.coverAspectRatio,
        updatedAt: books.updatedAt,
        coverSource: bookMetadata.coverSource,
        sharedAuthors: sql<number>`count(*)::int`.as('shared_authors'),
        primaryFormat: bookFiles.format,
      })
      .from(bookAuthors)
      .innerJoin(books, eq(books.id, bookAuthors.bookId))
      .innerJoin(libraries, eq(libraries.id, books.libraryId))
      .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
      .leftJoin(bookFiles, eq(bookFiles.id, books.primaryFileId))
      .where(and(inArray(bookAuthors.authorId, authorIds), inArray(books.libraryId, libraryIds), ne(books.id, bookId), ...filterClauses))
      .groupBy(books.id, books.updatedAt, libraries.coverAspectRatio, bookMetadata.title, bookMetadata.coverSource, bookFiles.format)
      .orderBy(desc(sql`shared_authors`), asc(bookMetadata.title), asc(books.id))
      .limit(options.limit ?? AUTHOR_BOOKS_LIMIT);

    const bookIds = rows.map((r) => r.bookId);
    const authorRows =
      bookIds.length === 0
        ? []
        : await this.db
            .select({ bookId: bookAuthors.bookId, name: authors.name })
            .from(bookAuthors)
            .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
            .where(inArray(bookAuthors.bookId, bookIds));

    const authorsByBook = this.groupNamesByBook(authorRows);

    return rows.map((r) => ({
      bookId: r.bookId,
      title: r.title,
      coverAspectRatio: r.coverAspectRatio,
      updatedAt: r.updatedAt ?? null,
      coverSource: r.coverSource,
      authorNames: authorsByBook.get(r.bookId) ?? [],
      isAudiobook: r.primaryFormat != null ? isAudioFormat(r.primaryFormat) : false,
      isComic: r.primaryFormat != null ? isComicFormat(r.primaryFormat) : false,
    }));
  }

  /**
   * The other series the book's authors wrote, one row per series with the user's read counts,
   * most-read first. Counts cover only the author's books the user can see.
   */
  async findAuthorSeries(
    bookId: number,
    excludeSeriesId: number | null,
    libraryIds: number[],
    userId: number,
    contentFilters?: ContentFilterRules,
  ): Promise<SeriesAggregateRow[]> {
    if (libraryIds.length === 0) return [];

    const authorIds = this.db.select({ authorId: bookAuthors.authorId }).from(bookAuthors).where(eq(bookAuthors.bookId, bookId));
    const authorBookIds = this.db.selectDistinct({ bookId: bookAuthors.bookId }).from(bookAuthors).where(inArray(bookAuthors.authorId, authorIds));
    const clauses: SQL[] = [inArray(books.id, authorBookIds)];
    if (excludeSeriesId != null) clauses.push(ne(bookMetadata.seriesId, excludeSeriesId));

    return this.aggregateSeries(clauses, libraryIds, userId, contentFilters, AUTHOR_SERIES_LIMIT);
  }

  /** Read counts and a cover book for each of `seriesIds`, over the books the user can see. */
  async findSeriesAggregates(
    seriesIds: number[],
    libraryIds: number[],
    userId: number,
    contentFilters?: ContentFilterRules,
  ): Promise<SeriesAggregateRow[]> {
    if (seriesIds.length === 0 || libraryIds.length === 0) return [];
    return this.aggregateSeries([inArray(bookMetadata.seriesId, seriesIds)], libraryIds, userId, contentFilters, seriesIds.length);
  }

  /** Cover details for books standing in for a series on a shelf. */
  async findCoverBooks(bookIds: number[]): Promise<CoverBookRow[]> {
    if (bookIds.length === 0) return [];

    const [rows, authorRows] = await Promise.all([
      this.db
        .select({
          bookId: books.id,
          coverAspectRatio: libraries.coverAspectRatio,
          updatedAt: books.updatedAt,
          coverSource: bookMetadata.coverSource,
          primaryFormat: bookFiles.format,
        })
        .from(books)
        .innerJoin(libraries, eq(libraries.id, books.libraryId))
        .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
        .leftJoin(bookFiles, eq(bookFiles.id, books.primaryFileId))
        .where(inArray(books.id, bookIds)),
      this.db
        .select({ bookId: bookAuthors.bookId, name: authors.name })
        .from(bookAuthors)
        .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
        .where(inArray(bookAuthors.bookId, bookIds)),
    ]);

    const authorsByBook = this.groupNamesByBook(authorRows);
    return rows.map((r) => ({
      bookId: r.bookId,
      coverAspectRatio: r.coverAspectRatio,
      updatedAt: r.updatedAt ?? null,
      coverSource: r.coverSource,
      authorNames: authorsByBook.get(r.bookId) ?? [],
      isAudiobook: r.primaryFormat != null ? isAudioFormat(r.primaryFormat) : false,
      isComic: r.primaryFormat != null ? isComicFormat(r.primaryFormat) : false,
    }));
  }

  private async aggregateSeries(
    clauses: SQL[],
    libraryIds: number[],
    userId: number,
    contentFilters: ContentFilterRules | undefined,
    limit: number,
  ): Promise<SeriesAggregateRow[]> {
    const filterClauses = contentFilters ? buildContentFilterClauses(contentFilters, this.db) : [];
    const readCount = sql<number>`(count(*) filter (where ${userBookStatus.status} = 'read'))::int`;
    const readingCount = sql<number>`(count(*) filter (where ${userBookStatus.status} in ('reading', 'on_hold', 'rereading')))::int`;
    const readingOrder = [
      ...seriesReadingOrderBy(bookMetadata.seriesIndex, bookMetadata.publishedDate, 'ASC'),
      sql`${bookMetadata.title} asc`,
      sql`${books.id} asc`,
    ];

    const rows = await this.db
      .select({
        seriesId: bookSeries.id,
        name: bookSeries.name,
        bookCount: sql<number>`count(*)::int`,
        readCount,
        readingCount,
        coverBookId: sql<number>`((array_agg(${books.id} order by ${sql.join(readingOrder, sql`, `)}))[1])::int`,
        isSerial: sql<boolean>`bool_or(${libraries.countSeriesAsOneBook})`,
      })
      .from(books)
      .innerJoin(libraries, eq(libraries.id, books.libraryId))
      .innerJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
      .innerJoin(bookSeries, eq(bookSeries.id, bookMetadata.seriesId))
      .leftJoin(userBookStatus, and(eq(userBookStatus.bookId, books.id), eq(userBookStatus.userId, userId)))
      .where(and(inArray(books.libraryId, libraryIds), ...clauses, ...filterClauses))
      .groupBy(bookSeries.id, bookSeries.name)
      .orderBy(desc(sql`${readCount} + ${readingCount}`), asc(bookSeries.name), asc(bookSeries.id))
      .limit(limit);

    return rows.map((r) => ({ ...r, coverBookId: Number(r.coverBookId), isSerial: r.isSerial === true }));
  }

  private async findSeriesWindowOffset(scope: SQL | undefined, readingOrder: SQL[], anchorBookId: number): Promise<number> {
    const ranked = this.db
      .select({
        bookId: books.id,
        position: sql<number>`(row_number() over (order by ${sql.join(readingOrder, sql`, `)}))::int`.as('position'),
      })
      .from(books)
      .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
      .where(scope)
      .as('ranked');

    const [anchor] = await this.db.select({ position: ranked.position }).from(ranked).where(eq(ranked.bookId, anchorBookId)).limit(1);

    if (!anchor) return 0;
    return seriesWindowOffset(Number(anchor.position));
  }

  private groupNamesByBook(rows: Array<{ bookId: number; name: string }>): Map<number, string[]> {
    const grouped = new Map<number, string[]>();
    for (const row of rows) {
      const names = grouped.get(row.bookId) ?? [];
      names.push(row.name);
      grouped.set(row.bookId, names);
    }
    return grouped;
  }
}

/**
 * Zero-based offset of a series window around the 1-based `position`. The window never reaches
 * further back than SERIES_WINDOW_BEFORE, so at the end of a long serial it holds the latest
 * chapters rather than filling up with ones read long ago.
 */
export function seriesWindowOffset(position: number): number {
  return Math.max(0, position - 1 - SERIES_WINDOW_BEFORE);
}

export function pgvectorHasIterativeScan(version: string | undefined): boolean {
  const [major, minor] = (version ?? '').split('.').map(Number);
  return major > 0 || (major === 0 && minor >= 8);
}
