import { RecommendationRepository, pgvectorHasIterativeScan, seriesWindowOffset } from './recommendation.repository';

type SelectStep = {
  terminal: 'where' | 'limit' | 'groupBy' | 'as';
  result: unknown;
};

function makeDb(steps: SelectStep[]) {
  const chains: Array<Record<string, vi.Mock>> = [];

  const select = vi.fn().mockImplementation(() => {
    const step = steps.shift();
    if (!step) throw new Error('No mocked select step available');

    const chain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      orderBy: vi.fn(),
      groupBy: vi.fn(),
      offset: vi.fn(),
      as: vi.fn(),
    };

    chain.from.mockReturnValue(chain);
    chain.offset.mockReturnValue(chain);
    chain.as.mockImplementation(() => step.result);
    chain.innerJoin.mockReturnValue(chain);
    chain.leftJoin.mockReturnValue(chain);
    chain.orderBy.mockReturnValue(chain);
    chain.groupBy.mockImplementation(() => {
      if (step.terminal === 'groupBy') return Promise.resolve(step.result);
      return chain;
    });
    chain.where.mockImplementation(() => {
      if (step.terminal === 'where') return Promise.resolve(step.result);
      return chain;
    });
    chain.limit.mockImplementation(() => Promise.resolve(step.result));

    chains.push(chain);
    return chain;
  });

  return {
    db: { select } as never,
    select,
    chains,
  };
}

describe('RecommendationRepository', () => {
  it('returns null target data when metadata does not exist', async () => {
    const { db, select } = makeDb([{ terminal: 'limit', result: [] }]);
    const repo = new RecommendationRepository(db);

    const result = await repo.getTargetBookData(100);

    expect(result).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('combines metadata, authors, genres, and tags for target book data', async () => {
    const { db, select } = makeDb([
      { terminal: 'limit', result: [{ embedding: [0.1, 0.2], seriesId: 42, seriesName: 'Saga', rating: 4.5 }] },
      {
        terminal: 'where',
        result: [
          { bookId: 7, name: 'Author A' },
          { bookId: 7, name: 'Author B' },
        ],
      },
      { terminal: 'where', result: [{ bookId: 7, name: 'Fantasy' }] },
      {
        terminal: 'where',
        result: [
          { bookId: 7, name: 'Epic' },
          { bookId: 7, name: 'Classic' },
        ],
      },
    ]);
    const repo = new RecommendationRepository(db);

    const result = await repo.getTargetBookData(7);

    expect(select).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      embedding: [0.1, 0.2],
      seriesId: 42,
      seriesName: 'Saga',
      rating: 4.5,
      authorNames: ['Author A', 'Author B'],
      genreTagNames: ['Fantasy', 'Epic', 'Classic'],
    });
  });

  it('returns empty ANN candidates when libraryIds is empty', async () => {
    const { db, select } = makeDb([]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findAnnCandidates([0.2, 0.3], 10, []);

    expect(result).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('returns empty ANN candidates for invalid embeddings', async () => {
    const { db, select } = makeDb([]);
    const repo = new RecommendationRepository(db);

    await expect(repo.findAnnCandidates([], 10, [1])).resolves.toEqual([]);
    await expect(repo.findAnnCandidates([1, Number.NaN], 10, [1])).resolves.toEqual([]);
    await expect(repo.findAnnCandidates([1, Number.POSITIVE_INFINITY], 10, [1])).resolves.toEqual([]);

    expect(select).not.toHaveBeenCalled();
  });

  it('queries ANN candidates with expected query shape when input is valid', async () => {
    const rows = [{ bookId: 11, cosineSim: 0.77, seriesId: null, seriesName: null, rating: 3.8 }];
    const { db, select, chains } = makeDb([{ terminal: 'limit', result: rows }]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findAnnCandidates([0.15, 0.45], 1, [3, 4]);

    expect(result).toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
    expect(chains[0].from).toHaveBeenCalledTimes(1);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(1);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(100);
  });

  it('turns on iterative index scans when leaving out a series on pgvector 0.8+', async () => {
    const rows = [{ bookId: 12, cosineSim: 0.7, seriesId: 5, seriesName: 'Other', rating: null }];
    const { db, select, chains } = makeDb([{ terminal: 'limit', result: rows }]);
    const execute = vi.fn().mockResolvedValue({ rows: [{ extversion: '0.8.6' }] });
    const txExecute = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn({ select, execute: txExecute }));
    const repo = new RecommendationRepository({ ...(db as object), execute, transaction } as never);

    const result = await repo.findAnnCandidates([0.1, 0.2], 1, [3], undefined, { excludeSeriesId: 9, limit: 300 });

    expect(result).toEqual(rows);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txExecute).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(300);
  });

  it('skips the transaction on pgvector versions without iterative scans', async () => {
    const { db, chains } = makeDb([{ terminal: 'limit', result: [] }]);
    const execute = vi.fn().mockResolvedValue({ rows: [{ extversion: '0.7.4' }] });
    const transaction = vi.fn();
    const repo = new RecommendationRepository({ ...(db as object), execute, transaction } as never);

    await repo.findAnnCandidates([0.1, 0.2], 1, [3], undefined, { excludeSeriesId: 9 });

    expect(transaction).not.toHaveBeenCalled();
    expect(chains[0].limit).toHaveBeenCalledWith(100);
  });

  it('reads pgvector versions', () => {
    expect(pgvectorHasIterativeScan('0.8.0')).toBe(true);
    expect(pgvectorHasIterativeScan('1.0.0')).toBe(true);
    expect(pgvectorHasIterativeScan('0.7.4')).toBe(false);
    expect(pgvectorHasIterativeScan(undefined)).toBe(false);
  });

  it('returns empty metadata quickly when no book ids are requested', async () => {
    const { db, select } = makeDb([]);
    const repo = new RecommendationRepository(db);

    const result = await repo.getCandidateMetadata([]);

    expect(result).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('groups candidate metadata by book and preserves requested order', async () => {
    const { db } = makeDb([
      {
        terminal: 'where',
        result: [
          { bookId: 10, name: 'Author A' },
          { bookId: 10, name: 'Author B' },
          { bookId: 11, name: 'Author C' },
        ],
      },
      {
        terminal: 'where',
        result: [
          { bookId: 10, name: 'Fantasy' },
          { bookId: 11, name: 'History' },
        ],
      },
      {
        terminal: 'where',
        result: [{ bookId: 11, name: 'Award Winner' }],
      },
    ]);

    const repo = new RecommendationRepository(db);

    const result = await repo.getCandidateMetadata([11, 10, 99]);

    expect(result).toEqual([
      {
        bookId: 11,
        authorNames: ['Author C'],
        genreTagNames: ['History', 'Award Winner'],
      },
      {
        bookId: 10,
        authorNames: ['Author A', 'Author B'],
        genreTagNames: ['Fantasy'],
      },
      {
        bookId: 99,
        authorNames: [],
        genreTagNames: [],
      },
    ]);
  });

  it('returns null for getSeriesIdentity when no metadata exists', async () => {
    const { db, select } = makeDb([{ terminal: 'limit', result: [] }]);
    const repo = new RecommendationRepository(db);

    const result = await repo.getSeriesIdentity(100);

    expect(result).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('returns id and trimmed name for getSeriesIdentity', async () => {
    const { db } = makeDb([{ terminal: 'limit', result: [{ seriesId: 88, seriesName: '  Dune Saga  ' }] }]);
    const repo = new RecommendationRepository(db);

    const result = await repo.getSeriesIdentity(7);

    expect(result).toEqual({ id: 88, name: 'Dune Saga' });
  });

  it('returns identity with null name when series name is empty or whitespace', async () => {
    const { db } = makeDb([{ terminal: 'limit', result: [{ seriesId: 88, seriesName: '   ' }] }]);
    const repo = new RecommendationRepository(db);

    expect(await repo.getSeriesIdentity(7)).toEqual({ id: 88, name: null });
  });

  it('returns empty series books when libraryIds is empty', async () => {
    const { db, select } = makeDb([]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findSeriesBooks(88, []);

    expect(result).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('returns null series identity when the metadata row has no series id', async () => {
    const { db, select } = makeDb([{ terminal: 'limit', result: [{ seriesId: null, seriesName: 'Dune' }] }]);
    const repo = new RecommendationRepository(db);

    const result = await repo.getSeriesIdentity(7);

    expect(result).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('queries series books with expected shape when input is valid', async () => {
    const rows = [
      { bookId: 1, title: 'Book 1', coverAspectRatio: '2/3', seriesIndex: '1', coverSource: 'extracted', primaryFormat: 'm4b' },
      { bookId: 2, title: 'Book 2', coverAspectRatio: '1/1', seriesIndex: '2', coverSource: null, primaryFormat: 'epub' },
    ];
    const authorRows = [{ bookId: 1, name: 'Frank Herbert' }];
    const { db, select, chains } = makeDb([
      { terminal: 'limit', result: rows },
      { terminal: 'where', result: authorRows },
    ]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findSeriesBooks(88, [3, 4]);

    expect(result).toEqual([
      {
        bookId: 1,
        title: 'Book 1',
        coverAspectRatio: '2/3',
        updatedAt: null,
        seriesIndex: '1',
        coverSource: 'extracted',
        authorNames: ['Frank Herbert'],
        isAudiobook: true,
        isComic: false,
      },
      {
        bookId: 2,
        title: 'Book 2',
        coverAspectRatio: '1/1',
        updatedAt: null,
        seriesIndex: '2',
        coverSource: null,
        authorNames: [],
        isAudiobook: false,
        isComic: false,
      },
    ]);
    expect(select).toHaveBeenCalledTimes(2);
    expect(chains[0].from).toHaveBeenCalledTimes(1);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(1);
    expect(chains[0].leftJoin).toHaveBeenCalledTimes(2);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
    expect(chains[0].offset).toHaveBeenCalledWith(0);
    expect(chains[0].limit).toHaveBeenCalledWith(26);
  });

  it('windows series books around the anchor book', async () => {
    const ranked = { bookId: 'ranked.id', position: 'ranked.position' };
    const { db, select, chains } = makeDb([
      { terminal: 'as', result: ranked },
      { terminal: 'limit', result: [{ position: 600 }] },
      {
        terminal: 'limit',
        result: [{ bookId: 600, title: 'Chapter 600', coverAspectRatio: '2/3', seriesIndex: '600', coverSource: null, primaryFormat: 'epub' }],
      },
      { terminal: 'where', result: [] },
    ]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findSeriesBooks(88, [3], undefined, 600);

    expect(result.map((row) => row.bookId)).toEqual([600]);
    expect(select).toHaveBeenCalledTimes(4);
    expect(chains[1].from).toHaveBeenCalledWith(ranked);
    expect(chains[2].offset).toHaveBeenCalledWith(594);
    expect(chains[2].limit).toHaveBeenCalledWith(26);
  });

  it('falls back to the start of the series when the anchor is not visible', async () => {
    const { db, chains } = makeDb([
      { terminal: 'as', result: {} },
      { terminal: 'limit', result: [] },
      { terminal: 'limit', result: [] },
    ]);
    const repo = new RecommendationRepository(db);

    await expect(repo.findSeriesBooks(88, [3], undefined, 600)).resolves.toEqual([]);
    expect(chains[2].offset).toHaveBeenCalledWith(0);
  });

  it('returns series books with empty authorNames when no authors exist', async () => {
    const rows = [{ bookId: 5, title: 'Solo Book', coverAspectRatio: '2/3', seriesIndex: null, coverSource: null, primaryFormat: null }];
    const { db } = makeDb([
      { terminal: 'limit', result: rows },
      { terminal: 'where', result: [] },
    ]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findSeriesBooks(88, [1]);

    expect(result).toEqual([
      {
        bookId: 5,
        title: 'Solo Book',
        coverAspectRatio: '2/3',
        updatedAt: null,
        seriesIndex: null,
        coverSource: null,
        authorNames: [],
        isAudiobook: false,
        isComic: false,
      },
    ]);
  });

  it('returns empty author books when libraryIds is empty', async () => {
    const { db, select } = makeDb([]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findAuthorBooks(1, []);

    expect(result).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('queries author books with expected shape when input is valid', async () => {
    const rows = [{ bookId: 10, title: 'Other Book', coverAspectRatio: '1/1', sharedAuthors: 2, coverSource: 'extracted', primaryFormat: 'MP3' }];
    const authorRows = [{ bookId: 10, name: 'Terry Pratchett' }];
    const { db, select, chains } = makeDb([
      { terminal: 'where', result: undefined },
      { terminal: 'limit', result: rows },
      { terminal: 'where', result: authorRows },
    ]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findAuthorBooks(1, [3]);

    expect(result).toEqual([
      {
        bookId: 10,
        title: 'Other Book',
        coverAspectRatio: '1/1',
        updatedAt: null,
        coverSource: 'extracted',
        authorNames: ['Terry Pratchett'],
        isAudiobook: true,
        isComic: false,
      },
    ]);
    expect(select).toHaveBeenCalledTimes(3);
    expect(chains[1].innerJoin).toHaveBeenCalledTimes(2);
    expect(chains[1].leftJoin).toHaveBeenCalledTimes(2);
    expect(chains[1].limit).toHaveBeenCalledWith(25);
  });

  it('returns author books with empty authorNames when no authors exist', async () => {
    const rows = [{ bookId: 7, title: 'Anonymous Work', coverAspectRatio: '2/3', sharedAuthors: 1, coverSource: null, primaryFormat: null }];
    const { db } = makeDb([
      { terminal: 'where', result: undefined },
      { terminal: 'limit', result: rows },
      { terminal: 'where', result: [] },
    ]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findAuthorBooks(1, [1]);

    expect(result).toEqual([
      {
        bookId: 7,
        title: 'Anonymous Work',
        coverAspectRatio: '2/3',
        updatedAt: null,
        coverSource: null,
        authorNames: [],
        isAudiobook: false,
        isComic: false,
      },
    ]);
  });

  it('flags comic primary formats as isComic for series books', async () => {
    const rows = [{ bookId: 9, title: 'Comic Issue', coverAspectRatio: '1/1', seriesIndex: '3', coverSource: 'extracted', primaryFormat: 'CBZ' }];
    const { db } = makeDb([
      { terminal: 'limit', result: rows },
      { terminal: 'where', result: [] },
    ]);
    const repo = new RecommendationRepository(db);

    const result = await repo.findSeriesBooks(88, [1]);

    expect(result).toEqual([
      {
        bookId: 9,
        title: 'Comic Issue',
        coverAspectRatio: '1/1',
        updatedAt: null,
        seriesIndex: '3',
        coverSource: 'extracted',
        authorNames: [],
        isAudiobook: false,
        isComic: true,
      },
    ]);
  });
});

describe('RecommendationRepository related shelves', () => {
  it('skips the author series and aggregate queries when nothing is in scope', async () => {
    const { db, select } = makeDb([]);
    const repo = new RecommendationRepository(db);

    await expect(repo.findAuthorSeries(1, null, [], 2)).resolves.toEqual([]);
    await expect(repo.findSeriesAggregates([], [1], 2)).resolves.toEqual([]);
    await expect(repo.findCoverBooks([])).resolves.toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('aggregates series with the cover book id coerced to a number', async () => {
    const { db, chains } = makeDb([
      {
        terminal: 'limit',
        result: [{ seriesId: 4, name: 'Chrysalis', bookCount: 3, readCount: 1, readingCount: 1, coverBookId: '81', isSerial: null }],
      },
    ]);
    const repo = new RecommendationRepository(db);

    const rows = await repo.findSeriesAggregates([4], [1], 2);

    expect(rows).toEqual([{ seriesId: 4, name: 'Chrysalis', bookCount: 3, readCount: 1, readingCount: 1, coverBookId: 81, isSerial: false }]);
    expect(chains[0].leftJoin).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(1);
  });

  it('maps cover books with their authors and format flags', async () => {
    const { db } = makeDb([
      { terminal: 'where', result: [{ bookId: 9, coverAspectRatio: '1/1', updatedAt: null, coverSource: 'embedded', primaryFormat: 'm4b' }] },
      { terminal: 'where', result: [{ bookId: 9, name: 'Actus' }] },
    ]);
    const repo = new RecommendationRepository(db);

    await expect(repo.findCoverBooks([9])).resolves.toEqual([
      { bookId: 9, coverAspectRatio: '1/1', updatedAt: null, coverSource: 'embedded', authorNames: ['Actus'], isAudiobook: true, isComic: false },
    ]);
  });
});

describe('seriesWindowOffset', () => {
  it('keeps five entries before the anchor in the middle of a long series', () => {
    expect(seriesWindowOffset(600)).toBe(594);
  });

  it('starts at the beginning when the anchor is near the start', () => {
    expect(seriesWindowOffset(1)).toBe(0);
    expect(seriesWindowOffset(6)).toBe(0);
  });

  it('keeps the latest chapter near the start of the window at the end of a serial', () => {
    expect(seriesWindowOffset(1004)).toBe(998);
  });
});
