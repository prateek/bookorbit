import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { SeriesRepository } from './series.repository';

const dialect = new PgDialect();

function render(fragment: unknown) {
  return dialect.sqlToQuery(fragment as SQL);
}

function renderedOrderBy(chain: Record<string, unknown>) {
  const orderBy = chain.orderBy as ReturnType<typeof vi.fn>;
  return (orderBy.mock.calls[0] as unknown[]).map((term) => render(term).sql);
}

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  const methods = [
    'from',
    'innerJoin',
    'leftJoin',
    'where',
    'groupBy',
    'orderBy',
    'limit',
    'offset',
    'having',
    'as',
    '$dynamic',
    'select',
    'selectDistinct',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

const NO_FACETS = { all: 0, notStarted: 0, inProgress: 0, complete: 0, hasGaps: 0 };

function makeFindPageDb(facetResult: unknown, dataResult: unknown) {
  const baseChain = makeChain([]);
  const facetChain = makeChain(facetResult);
  const dataChain = makeChain(dataResult);

  const select = vi.fn().mockReturnValueOnce(baseChain).mockReturnValueOnce(facetChain).mockReturnValueOnce(dataChain);

  return { select, baseChain, facetChain, dataChain };
}

function stubPageHelpers(
  repo: SeriesRepository,
  maps?: { authors?: Map<number, string[]>; covers?: Map<number, number[]>; members?: Map<number, unknown>; next?: Map<number, unknown> },
) {
  vi.spyOn(repo as never, 'fetchAuthorsForSeries').mockResolvedValue(maps?.authors ?? new Map());
  vi.spyOn(repo as never, 'fetchCoverBookIds').mockResolvedValue(maps?.covers ?? new Map());
  vi.spyOn(repo as never, 'fetchSeriesMembers').mockResolvedValue(maps?.members ?? new Map());
  vi.spyOn(repo as never, 'fetchNextMembers').mockResolvedValue(maps?.next ?? new Map());
}

function makeDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

const BASE_PARAMS = {
  page: 0,
  size: 25,
  sort: 'name' as const,
  order: 'asc' as const,
  libraryIds: [1],
  userId: 7,
};

describe('SeriesRepository', () => {
  let db: ReturnType<typeof makeDb>;
  let repo: SeriesRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    repo = new SeriesRepository(db as never);
  });

  describe('findPage', () => {
    it('returns empty page when no series rows found', async () => {
      const { select, dataChain } = makeFindPageDb([{ ...NO_FACETS }], []);
      dataChain.then = (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve);
      db.select = select;

      stubPageHelpers(repo);

      const result = await repo.findPage(BASE_PARAMS);

      expect(result).toEqual({ items: [], total: 0, facets: NO_FACETS, page: 0, size: 25 });
    });

    it('returns items with authors and coverBookIds when rows found', async () => {
      const seriesRows = [
        { id: 10, name: 'Dune', bookCount: 6, readCount: 3, readingCount: 1, expectedBookCount: 6, lastAddedAt: '2024-01-01' },
        { id: 11, name: 'Foundation', bookCount: 7, readCount: 0, readingCount: 0, expectedBookCount: null, lastAddedAt: '2023-06-15' },
      ];
      const { select } = makeFindPageDb([{ ...NO_FACETS, all: 2 }], seriesRows);
      db.select = select;

      const authorsMap = new Map([
        [10, ['Frank Herbert']],
        [11, ['Isaac Asimov']],
      ]);
      const coversMap = new Map([
        [10, [100, 101]],
        [11, [200]],
      ]);
      const membersMap = new Map<number, unknown>([
        [10, { rows: [{ bookId: 100, seriesIndex: '1', title: 'Dune', status: 'read' }], truncated: false, libraryNames: ['Novels'] }],
      ]);

      const nextMap = new Map<number, unknown>([[10, { bookId: 101, seriesIndex: '2', title: 'Dune Messiah', status: null }]]);

      stubPageHelpers(repo, { authors: authorsMap, covers: coversMap, members: membersMap, next: nextMap });

      const result = await repo.findPage(BASE_PARAMS);

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        id: 10,
        name: 'Dune',
        bookCount: 6,
        readCount: 3,
        readingCount: 1,
        expectedBookCount: 6,
        authors: ['Frank Herbert'],
        coverBookIds: [100, 101],
        lastAddedAt: '2024-01-01',
        members: [{ bookId: 100, seriesIndex: '1', title: 'Dune', status: 'read' }],
        membersTruncated: false,
        libraryNames: ['Novels'],
        next: { bookId: 101, seriesIndex: '2', title: 'Dune Messiah', status: null },
      });
      expect(result.items[1]).toEqual({
        id: 11,
        name: 'Foundation',
        bookCount: 7,
        readCount: 0,
        readingCount: 0,
        expectedBookCount: null,
        authors: ['Isaac Asimov'],
        coverBookIds: [200],
        lastAddedAt: '2023-06-15',
        members: [],
        membersTruncated: false,
        libraryNames: [],
        next: null,
      });
    });

    it('uses empty arrays for authors and covers when maps have no entry', async () => {
      const { select } = makeFindPageDb(
        [{ ...NO_FACETS, all: 1 }],
        [{ id: 99, name: 'Unknown', bookCount: 1, readCount: 0, readingCount: 0, expectedBookCount: null, lastAddedAt: null }],
      );
      db.select = select;

      stubPageHelpers(repo);

      const result = await repo.findPage(BASE_PARAMS);

      expect(result.items[0]!.authors).toEqual([]);
      expect(result.items[0]!.coverBookIds).toEqual([]);
      expect(result.items[0]!.lastAddedAt).toBeNull();
    });

    it('calls having() when completionStatus is provided', async () => {
      const { select, dataChain } = makeFindPageDb([{ ...NO_FACETS }], []);
      db.select = select;

      stubPageHelpers(repo);

      await repo.findPage({ ...BASE_PARAMS, completionStatus: 'complete' });

      expect(dataChain.having).toHaveBeenCalled();
    });

    it('does not call having() when completionStatus is undefined', async () => {
      const { select, dataChain } = makeFindPageDb([{ ...NO_FACETS }], []);
      db.select = select;

      stubPageHelpers(repo);

      await repo.findPage({ ...BASE_PARAMS, completionStatus: undefined });

      expect(dataChain.having).not.toHaveBeenCalled();
    });

    it('passes correct pagination values to limit and offset', async () => {
      const { select, dataChain } = makeFindPageDb([{ ...NO_FACETS }], []);
      db.select = select;

      stubPageHelpers(repo);

      await repo.findPage({ ...BASE_PARAMS, page: 2, size: 10 });

      expect(dataChain.limit).toHaveBeenCalledWith(10);
      expect(dataChain.offset).toHaveBeenCalledWith(20);
    });

    it('reports the facet matching the active completion filter as the total', async () => {
      const { select } = makeFindPageDb([{ all: 40, notStarted: 25, inProgress: 9, complete: 6, hasGaps: 4 }], []);
      db.select = select;
      stubPageHelpers(repo);

      await expect(repo.findPage({ ...BASE_PARAMS, completionStatus: 'has_gaps' })).resolves.toMatchObject({ total: 4 });
      db.select = makeFindPageDb([{ all: 40, notStarted: 25, inProgress: 9, complete: 6, hasGaps: 4 }], []).select;
      await expect(repo.findPage({ ...BASE_PARAMS, completionStatus: 'complete' })).resolves.toMatchObject({ total: 6 });
      db.select = makeFindPageDb([{ all: 40, notStarted: 25, inProgress: 9, complete: 6, hasGaps: 4 }], []).select;
      await expect(repo.findPage(BASE_PARAMS)).resolves.toMatchObject({ total: 40 });
    });

    it('handles total fallback to 0 when count row is missing', async () => {
      const { select } = makeFindPageDb([], []);
      db.select = select;

      stubPageHelpers(repo);

      const result = await repo.findPage(BASE_PARAMS);

      expect(result.total).toBe(0);
    });

    it('returns correct page and size in result', async () => {
      const { select } = makeFindPageDb([{ ...NO_FACETS }], []);
      db.select = select;

      stubPageHelpers(repo);

      const result = await repo.findPage({ ...BASE_PARAMS, page: 3, size: 15 });

      expect(result.page).toBe(3);
      expect(result.size).toBe(15);
    });

    it('uses containment rather than trigram expansion for multi-word searches', async () => {
      const { select, baseChain } = makeFindPageDb([{ ...NO_FACETS }], []);
      db.select = select;
      stubPageHelpers(repo);

      await repo.findPage({ ...BASE_PARAMS, q: 'The Wax Child', sort: 'relevance', order: 'desc' });

      const where = (baseChain.where as ReturnType<typeof vi.fn>).mock.calls[0]![0] as SQL;
      const query = new PgDialect().sqlToQuery(where);
      expect(query.sql).toContain(' ILIKE ');
      expect(query.sql).not.toContain(' % ');
      expect(query.params).toContain('%The Wax Child%');
    });
  });

  describe('countSeries', () => {
    it('returns the distinct series total for the accessible libraries', async () => {
      const chain = makeChain([{ total: 1200 }]);
      db.select.mockReturnValue(chain);

      await expect(repo.countSeries({ libraryIds: [1, 2] })).resolves.toBe(1200);
    });

    it('short-circuits without querying when no library is accessible', async () => {
      await expect(repo.countSeries({ libraryIds: [] })).resolves.toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('findDetail', () => {
    it('returns null when query returns empty rows', async () => {
      const chain = makeChain([]);
      db.select.mockReturnValue(chain);

      const result = await repo.findDetail({ seriesId: 1, userId: 7, libraryIds: [1] });

      expect(result).toBeNull();
    });

    it('returns detail row with authors and indices when series is found', async () => {
      const mainChain = makeChain([{ id: 42, name: 'Dune', bookCount: 6, readCount: 2 }]);
      const indicesChain = makeChain([{ idx: 1 }, { idx: 2 }, { idx: 3 }]);
      db.select.mockReturnValueOnce(mainChain).mockReturnValueOnce(indicesChain);

      const authorsMap = new Map([[42, ['Frank Herbert']]]);
      vi.spyOn(repo as never, 'fetchAuthorsForSeries').mockResolvedValue(authorsMap);

      const result = await repo.findDetail({ seriesId: 42, userId: 7, libraryIds: [1] });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(42);
      expect(result!.name).toBe('Dune');
      expect(result!.bookCount).toBe(6);
      expect(result!.readCount).toBe(2);
      expect(result!.authors).toEqual(['Frank Herbert']);
      expect(result!.indices).toEqual([1, 2, 3]);
    });

    it('returns empty authors when map has no entry for seriesId', async () => {
      const mainChain = makeChain([{ id: 55, name: 'NoAuthor', bookCount: 1, readCount: 0 }]);
      const indicesChain = makeChain([]);
      db.select.mockReturnValueOnce(mainChain).mockReturnValueOnce(indicesChain);

      vi.spyOn(repo as never, 'fetchAuthorsForSeries').mockResolvedValue(new Map());

      const result = await repo.findDetail({ seriesId: 55, userId: 7, libraryIds: [1] });

      expect(result!.authors).toEqual([]);
      expect(result!.indices).toEqual([]);
    });
  });

  describe('findBookIds', () => {
    const BOOK_PARAMS = {
      seriesId: 42,
      page: 0,
      size: 50,
      sort: 'seriesIndex' as const,
      order: 'asc' as const,
      libraryIds: [1],
      userId: 7,
    };

    it('returns bookIds and total from parallel queries', async () => {
      const dataChain = makeChain([{ id: 10 }, { id: 20 }, { id: 30 }]);
      const countChain = makeChain([{ total: 3 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await repo.findBookIds(BOOK_PARAMS);

      expect(result.bookIds).toEqual([10, 20, 30]);
      expect(result.total).toBe(3);
    });

    it('returns empty bookIds when no books found', async () => {
      const dataChain = makeChain([]);
      const countChain = makeChain([{ total: 0 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await repo.findBookIds(BOOK_PARAMS);

      expect(result.bookIds).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('passes limit and offset for pagination', async () => {
      const dataChain = makeChain([]);
      const countChain = makeChain([{ total: 0 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      await repo.findBookIds({ ...BOOK_PARAMS, page: 2, size: 10 });

      expect(dataChain.limit).toHaveBeenCalledWith(10);
      expect(dataChain.offset).toHaveBeenCalledWith(20);
    });

    it('sorts by title when sort is title', async () => {
      const dataChain = makeChain([{ id: 5 }]);
      const countChain = makeChain([{ total: 1 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      await repo.findBookIds({ ...BOOK_PARAMS, sort: 'title', order: 'asc' });

      expect(dataChain.orderBy).toHaveBeenCalledTimes(1);
    });

    it('sorts by addedAt when sort is addedAt', async () => {
      const dataChain = makeChain([{ id: 5 }]);
      const countChain = makeChain([{ total: 1 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      await repo.findBookIds({ ...BOOK_PARAMS, sort: 'addedAt', order: 'desc' });

      expect(dataChain.orderBy).toHaveBeenCalledTimes(1);
    });

    it('sorts by seriesIndex when sort is seriesIndex', async () => {
      const dataChain = makeChain([{ id: 5 }]);
      const countChain = makeChain([{ total: 1 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      await repo.findBookIds({ ...BOOK_PARAMS, sort: 'seriesIndex', order: 'asc' });

      expect(dataChain.orderBy).toHaveBeenCalledTimes(1);
    });

    it('opens on the page holding the anchor book in series order', async () => {
      const anchorChain = makeChain([{ seriesIndex: '501' }]);
      const beforeChain = makeChain([{ before: 500 }]);
      const dataChain = makeChain([{ id: 501 }]);
      const countChain = makeChain([{ total: 1700 }]);
      db.select.mockReturnValueOnce(anchorChain).mockReturnValueOnce(beforeChain).mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await repo.findBookIds({ ...BOOK_PARAMS, page: 0, size: 50, anchorBookId: 501 });

      expect(result.page).toBe(10);
      expect(dataChain.offset).toHaveBeenCalledWith(500);
    });

    it('keeps the requested page when the anchor is not in the listing', async () => {
      const anchorChain = makeChain([]);
      const dataChain = makeChain([]);
      const countChain = makeChain([{ total: 0 }]);
      db.select.mockReturnValueOnce(anchorChain).mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await repo.findBookIds({ ...BOOK_PARAMS, page: 3, size: 10, anchorBookId: 999 });

      expect(result.page).toBe(3);
      expect(dataChain.offset).toHaveBeenCalledWith(30);
    });

    it('ignores the anchor for sorts other than series order', async () => {
      const dataChain = makeChain([]);
      const countChain = makeChain([{ total: 0 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await repo.findBookIds({ ...BOOK_PARAMS, sort: 'title', page: 2, size: 10, anchorBookId: 5 });

      expect(result.page).toBe(2);
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('coerces total to number', async () => {
      const dataChain = makeChain([]);
      const countChain = makeChain([{ total: '42' }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await repo.findBookIds(BOOK_PARAMS);

      expect(typeof result.total).toBe('number');
      expect(result.total).toBe(42);
    });
  });
  describe('series reading order', () => {
    const BOOK_PARAMS = {
      seriesId: 42,
      page: 0,
      size: 2,
      sort: 'seriesIndex' as const,
      order: 'asc' as const,
      libraryIds: [1],
      userId: 7,
    };

    it('orders the series listing by index, then release date, then book id', async () => {
      const dataChain = makeChain([]);
      const countChain = makeChain([{ total: 0 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      await repo.findBookIds({ ...BOOK_PARAMS, order: 'desc' });

      const terms = renderedOrderBy(dataChain);
      expect(terms.slice(-2)).toEqual(['"book_metadata"."published_date" DESC NULLS LAST', '"books"."id" asc']);
      expect(terms[1]).toContain('COLLATE "C" DESC NULLS LAST');
    });

    it('counts earlier-released chapters sharing the anchor index as ahead of it', async () => {
      const anchorChain = makeChain([{ seriesIndex: null, publishedDate: '2024-06-01' }]);
      const beforeChain = makeChain([{ before: 4 }]);
      db.select
        .mockReturnValueOnce(anchorChain)
        .mockReturnValueOnce(beforeChain)
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain([{ total: 6 }]));

      const result = await repo.findBookIds({ ...BOOK_PARAMS, anchorBookId: 88 });

      const where = render((beforeChain.where as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
      expect(where.sql).toContain('"book_metadata"."published_date" < $');
      expect(where.params).toEqual(expect.arrayContaining(['2024-06-01', 88]));
      expect(result.page).toBe(2);
    });

    it('treats every dated chapter as ahead of an undated anchor in either direction', async () => {
      const anchorChain = makeChain([{ seriesIndex: '5', publishedDate: null }]);
      const beforeChain = makeChain([{ before: 0 }]);
      db.select
        .mockReturnValueOnce(anchorChain)
        .mockReturnValueOnce(beforeChain)
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain([{ total: 0 }]));

      await repo.findBookIds({ ...BOOK_PARAMS, order: 'desc', anchorBookId: 88 });

      const where = render((beforeChain.where as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
      expect(where.sql).toContain('"book_metadata"."published_date" is not null');
    });

    it('compares release dates the other way when the listing runs newest first', async () => {
      const anchorChain = makeChain([{ seriesIndex: '5', publishedDate: '2024-01-01' }]);
      const beforeChain = makeChain([{ before: 0 }]);
      db.select
        .mockReturnValueOnce(anchorChain)
        .mockReturnValueOnce(beforeChain)
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain([{ total: 0 }]));

      await repo.findBookIds({ ...BOOK_PARAMS, order: 'desc', anchorBookId: 88 });

      const where = render((beforeChain.where as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
      expect(where.sql).toContain('"book_metadata"."published_date" > $');
      expect(where.sql).not.toContain('"book_metadata"."published_date" < $');
    });

    it('picks the next chapter by release date among chapters sharing the current index', async () => {
      const currentChain = makeChain([{ seriesIndex: null, publishedDate: '2023-01-10' }]);
      const nextChain = makeChain([{ bookId: 90, title: 'Book 6 - Chapter 1', seriesIndex: null, fileId: 3, format: 'epub' }]);
      db.select.mockReturnValueOnce(currentChain).mockReturnValueOnce(nextChain);

      const result = await repo.findNextReadableBook({ seriesId: 42, bookId: 89, libraryIds: [1], formats: ['epub'] });

      expect(result).toEqual(expect.objectContaining({ bookId: 90 }));
      const where = render((nextChain.where as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
      expect(where.sql).toContain('"book_metadata"."published_date" > $');
      expect(where.sql).toContain('"book_metadata"."published_date" is null');
      expect(where.params).toEqual(expect.arrayContaining(['2023-01-10', 89]));
      const terms = renderedOrderBy(nextChain);
      expect(terms[2]).toBe('"book_metadata"."published_date" ASC NULLS LAST');
      expect(terms[3]).toBe('"books"."id" asc');
    });

    it('only moves on to later undated chapters from an undated one', async () => {
      const currentChain = makeChain([{ seriesIndex: null, publishedDate: null }]);
      const nextChain = makeChain([]);
      db.select.mockReturnValueOnce(currentChain).mockReturnValueOnce(nextChain);

      await repo.findNextReadableBook({ seriesId: 42, bookId: 89, libraryIds: [1], formats: ['epub'] });

      const where = render((nextChain.where as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
      expect(where.sql).toContain('"book_metadata"."published_date" is null and "books"."id" > $');
      expect(where.sql).not.toContain('"book_metadata"."published_date" > $');
    });
  });
});
