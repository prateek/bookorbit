import { NotFoundException } from '@nestjs/common';

import type { RequestUser } from '../../common/types/request-user';
import { RecommendationService } from './recommendation.service';
import { EMPTY_CONTENT_FILTER_RULES } from '@bookorbit/types';

function makeUser(isSuperuser = false): RequestUser {
  return {
    id: 12,
    username: 'reader',
    name: 'Reader',
    email: null,
    active: true,
    isSuperuser,
    isDefaultPassword: false,
    tokenVersion: 1,
    settings: {},
    avatarUrl: null,
    provisioningMethod: 'local',
    permissions: [],

    contentFilters: EMPTY_CONTENT_FILTER_RULES,
  };
}

function makeService() {
  const recRepo = {
    getTargetBookData: vi.fn(),
    findAnnCandidates: vi.fn(),
    getCandidateMetadata: vi.fn(),
    getSeriesIdentity: vi.fn(),
    findSeriesBooks: vi.fn(),
    findAuthorBooks: vi.fn(),
    findAuthorSeries: vi.fn(),
    findSeriesAggregates: vi.fn(),
    findCoverBooks: vi.fn(),
  };
  const bookRepo = {
    findLibraryIdByBookId: vi.fn(),
    findRecommendationTitlesByBookIds: vi.fn(),
  };
  const libraryService = {
    verifyUserAccess: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue([{ id: 7 }]),
    findAccessibleLibraryIds: vi.fn().mockResolvedValue([7]),
  };
  const embedder = {
    embedBook: vi.fn(),
  };
  const userBookStatusService = {
    findByBookIds: vi.fn().mockResolvedValue(new Map()),
  };

  const service = new RecommendationService(
    recRepo as never,
    bookRepo as never,
    libraryService as never,
    embedder as never,
    userBookStatusService as never,
  );

  return { service, recRepo, bookRepo, libraryService, embedder, userBookStatusService };
}

describe('RecommendationService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFoundException when the target book does not exist', async () => {
    const { service, bookRepo } = makeService();
    bookRepo.findLibraryIdByBookId.mockResolvedValue(null);

    await expect(service.getRecommendations(999, makeUser())).rejects.toThrow(NotFoundException);
  });

  it('passes superuser status into access verification', async () => {
    const { service, bookRepo, libraryService, recRepo } = makeService();
    const user = makeUser(true);

    bookRepo.findLibraryIdByBookId.mockResolvedValue(21);
    recRepo.getTargetBookData.mockResolvedValue(null);

    await service.getRecommendations(1, user);

    expect(libraryService.verifyUserAccess).toHaveBeenCalledWith(user.id, 21, true);
  });

  it('uses fallback embedding when the target book has no metadata row', async () => {
    const { service, bookRepo, recRepo, embedder, libraryService } = makeService();

    bookRepo.findLibraryIdByBookId.mockResolvedValue(21);
    recRepo.getTargetBookData.mockResolvedValue(null);
    embedder.embedBook.mockResolvedValue([0.4, 0.6]);
    libraryService.findAll.mockResolvedValue([{ id: 7 }, { id: 9 }]);
    recRepo.findAnnCandidates.mockResolvedValue([{ bookId: 91, cosineSim: 0.78, seriesId: null, seriesName: null, rating: null }]);
    recRepo.getCandidateMetadata.mockResolvedValue([{ bookId: 91, authorNames: [], genreTagNames: [] }]);
    bookRepo.findRecommendationTitlesByBookIds.mockResolvedValue([
      { id: 91, title: 'Fallback Match', coverAspectRatio: '1/1', updatedAt: null, hasCover: false, authors: [], isAudiobook: false },
    ]);

    await expect(service.getRecommendations(55, makeUser())).resolves.toEqual([
      {
        id: 91,
        title: 'Fallback Match',
        coverAspectRatio: '1/1',
        updatedAt: null,
        hasCover: false,
        authors: [],
        isAudiobook: false,
        readStatus: null,
      },
    ]);
    expect(embedder.embedBook).toHaveBeenCalledWith(55);
    expect(recRepo.findAnnCandidates).toHaveBeenCalledWith([0.4, 0.6], 55, [7, 9], EMPTY_CONTENT_FILTER_RULES);
  });

  it('returns empty recommendations when fallback embedding is invalid', async () => {
    const { service, bookRepo, recRepo, embedder } = makeService();

    bookRepo.findLibraryIdByBookId.mockResolvedValue(3);
    recRepo.getTargetBookData.mockResolvedValue({
      embedding: null,
      seriesId: null,
      seriesName: null,
      rating: null,
      authorNames: [],
      genreTagNames: [],
    });
    embedder.embedBook.mockResolvedValue([]);

    await expect(service.getRecommendations(3, makeUser())).resolves.toEqual([]);
    expect(recRepo.findAnnCandidates).not.toHaveBeenCalled();
  });

  it('returns empty recommendations when metadata row is missing and generated embedding is invalid', async () => {
    const { service, bookRepo, recRepo, embedder } = makeService();

    bookRepo.findLibraryIdByBookId.mockResolvedValue(6);
    recRepo.getTargetBookData.mockResolvedValue(null);
    embedder.embedBook.mockResolvedValue([Number.NaN]);

    await expect(service.getRecommendations(6, makeUser())).resolves.toEqual([]);
    expect(recRepo.findAnnCandidates).not.toHaveBeenCalled();
  });

  it('rescales inconsistent provider values and keeps ranking deterministic', async () => {
    const { service, recRepo, bookRepo } = makeService();

    bookRepo.findLibraryIdByBookId.mockResolvedValue(9);
    recRepo.getTargetBookData.mockResolvedValue({
      embedding: [0.1, 0.2],
      seriesId: 45,
      seriesName: 'Dune Saga',
      rating: 4,
      authorNames: ['Frank Herbert'],
      genreTagNames: ['Sci-Fi', 'Classic'],
    });
    recRepo.findAnnCandidates.mockResolvedValue([
      { bookId: 100, cosineSim: 1.5, seriesId: 45, seriesName: ' dune saga ', rating: 9 },
      { bookId: 200, cosineSim: -2, seriesId: 99, seriesName: 'Other', rating: 4 },
    ]);
    recRepo.getCandidateMetadata.mockResolvedValue([
      { bookId: 100, authorNames: ['Frank Herbert'], genreTagNames: ['Sci-Fi'] },
      { bookId: 200, authorNames: [], genreTagNames: [] },
    ]);
    bookRepo.findRecommendationTitlesByBookIds.mockResolvedValue([
      { id: 200, title: 'Second', coverAspectRatio: '2/3', updatedAt: null, hasCover: true, authors: [], isAudiobook: false },
      { id: 100, title: 'First', coverAspectRatio: '1/1', updatedAt: null, hasCover: false, authors: ['Frank Herbert'], isAudiobook: false },
    ]);

    const result = await service.getRecommendations(9, makeUser());

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 100,
      title: 'First',
      coverAspectRatio: '1/1',
      updatedAt: null,
      hasCover: false,
      authors: ['Frank Herbert'],
      isAudiobook: false,
      readStatus: null,
    });
    expect(result[1]).toEqual({
      id: 200,
      title: 'Second',
      coverAspectRatio: '2/3',
      updatedAt: null,
      hasCover: true,
      authors: [],
      isAudiobook: false,
      readStatus: null,
    });
  });

  it('normalizes author and genre-tag metadata before similarity scoring', async () => {
    const { service, recRepo, bookRepo } = makeService();

    bookRepo.findLibraryIdByBookId.mockResolvedValue(13);
    recRepo.getTargetBookData.mockResolvedValue({
      embedding: [0.4, 0.2],
      seriesId: null,
      seriesName: null,
      rating: null,
      authorNames: [' Frank Herbert '],
      genreTagNames: [' Sci-Fi '],
    });
    recRepo.findAnnCandidates.mockResolvedValue([
      { bookId: 1, cosineSim: 0.7, seriesId: null, seriesName: null, rating: null },
      { bookId: 2, cosineSim: 0.85, seriesId: null, seriesName: null, rating: null },
    ]);
    recRepo.getCandidateMetadata.mockResolvedValue([
      { bookId: 1, authorNames: ['frank herbert'], genreTagNames: ['sci-fi'] },
      { bookId: 2, authorNames: [], genreTagNames: [] },
    ]);
    bookRepo.findRecommendationTitlesByBookIds.mockResolvedValue([
      { id: 1, title: 'Token Match', coverAspectRatio: '2/3', updatedAt: null, hasCover: true, authors: ['frank herbert'], isAudiobook: true },
      { id: 2, title: 'Cosine Only', coverAspectRatio: '1/1', updatedAt: null, hasCover: false, authors: [], isAudiobook: false },
    ]);

    const result = await service.getRecommendations(13, makeUser());

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 1,
      title: 'Token Match',
      coverAspectRatio: '2/3',
      updatedAt: null,
      hasCover: true,
      authors: ['frank herbert'],
      isAudiobook: true,
      readStatus: null,
    });
    expect(result[1]).toEqual({
      id: 2,
      title: 'Cosine Only',
      coverAspectRatio: '1/1',
      updatedAt: null,
      hasCover: false,
      authors: [],
      isAudiobook: false,
      readStatus: null,
    });
  });

  it('filters out ANN results that cannot be mapped to cards', async () => {
    const { service, recRepo, bookRepo } = makeService();

    bookRepo.findLibraryIdByBookId.mockResolvedValue(2);
    recRepo.getTargetBookData.mockResolvedValue({
      embedding: [0.2],
      seriesId: null,
      seriesName: null,
      rating: null,
      authorNames: [],
      genreTagNames: [],
    });
    recRepo.findAnnCandidates.mockResolvedValue([
      { bookId: 10, cosineSim: 0.9, seriesId: null, seriesName: null, rating: null },
      { bookId: 11, cosineSim: 0.8, seriesId: null, seriesName: null, rating: null },
    ]);
    recRepo.getCandidateMetadata.mockResolvedValue([
      { bookId: 10, authorNames: [], genreTagNames: [] },
      { bookId: 11, authorNames: [], genreTagNames: [] },
    ]);
    bookRepo.findRecommendationTitlesByBookIds.mockResolvedValue([
      { id: 11, title: 'Only Card', coverAspectRatio: '2/3', updatedAt: null, hasCover: true, authors: [], isAudiobook: false },
    ]);

    const result = await service.getRecommendations(2, makeUser());

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 11,
      title: 'Only Card',
      coverAspectRatio: '2/3',
      updatedAt: null,
      hasCover: true,
      authors: [],
      isAudiobook: false,
      readStatus: null,
    });
  });

  it('returns empty recommendations when user has no accessible libraries with ANN candidates', async () => {
    const { service, recRepo, bookRepo, libraryService } = makeService();

    bookRepo.findLibraryIdByBookId.mockResolvedValue(15);
    recRepo.getTargetBookData.mockResolvedValue({
      embedding: [0.2],
      seriesId: null,
      seriesName: null,
      rating: null,
      authorNames: [],
      genreTagNames: [],
    });
    libraryService.findAll.mockResolvedValue([]);
    recRepo.findAnnCandidates.mockResolvedValue([]);

    await expect(service.getRecommendations(15, makeUser())).resolves.toEqual([]);
    expect(recRepo.getCandidateMetadata).not.toHaveBeenCalled();
    expect(bookRepo.findRecommendationTitlesByBookIds).not.toHaveBeenCalled();
  });

  it('limits rescored output to 25 candidates before loading cards', async () => {
    const { service, recRepo, bookRepo } = makeService();

    bookRepo.findLibraryIdByBookId.mockResolvedValue(8);
    recRepo.getTargetBookData.mockResolvedValue({
      embedding: [0.3],
      seriesId: null,
      seriesName: null,
      rating: null,
      authorNames: [],
      genreTagNames: [],
    });

    const candidates = Array.from({ length: 30 }, (_, i) => ({
      bookId: i + 1,
      cosineSim: 1 - i * 0.01,
      seriesId: null,
      seriesName: null,
      rating: null,
    }));

    recRepo.findAnnCandidates.mockResolvedValue(candidates);
    recRepo.getCandidateMetadata.mockResolvedValue(candidates.map((c) => ({ bookId: c.bookId, authorNames: [], genreTagNames: [] })));
    bookRepo.findRecommendationTitlesByBookIds.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        title: `Book ${i + 1}`,
        coverAspectRatio: '2/3',
        updatedAt: null,
        hasCover: false,
        authors: [],
        isAudiobook: false,
      })),
    );

    const result = await service.getRecommendations(8, makeUser());

    expect(result).toHaveLength(25);
    expect(bookRepo.findRecommendationTitlesByBookIds).toHaveBeenCalledWith(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  describe('getSeriesBooks', () => {
    it('throws NotFoundException when the book does not exist', async () => {
      const { service, bookRepo } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(null);

      await expect(service.getSeriesBooks(999, makeUser())).rejects.toThrow(NotFoundException);
    });

    it('verifies user access to the book library', async () => {
      const { service, bookRepo, libraryService, recRepo } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(21);
      recRepo.getSeriesIdentity.mockResolvedValue(null);

      await service.getSeriesBooks(1, makeUser(true));

      expect(libraryService.verifyUserAccess).toHaveBeenCalledWith(12, 21, true);
    });

    it('returns empty array when the book has no series', async () => {
      const { service, bookRepo, recRepo } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      recRepo.getSeriesIdentity.mockResolvedValue(null);

      await expect(service.getSeriesBooks(10, makeUser())).resolves.toEqual([]);
      expect(recRepo.findSeriesBooks).not.toHaveBeenCalled();
    });

    it('returns series books ordered by index when book has a series', async () => {
      const { service, bookRepo, recRepo, libraryService } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      recRepo.getSeriesIdentity.mockResolvedValue({ id: 42, name: 'Stormlight Archive' });
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5, 6]);
      recRepo.findSeriesBooks.mockResolvedValue([
        {
          bookId: 1,
          title: 'The Way of Kings',
          coverAspectRatio: '2/3',
          updatedAt: null,
          seriesIndex: '1',
          coverSource: 'extracted',
          authorNames: ['Brandon Sanderson'],
          isAudiobook: false,
        },
        {
          bookId: 2,
          title: 'Words of Radiance',
          coverAspectRatio: '1/1',
          updatedAt: null,
          seriesIndex: '2',
          coverSource: null,
          authorNames: [],
          isAudiobook: false,
        },
        {
          bookId: 3,
          title: 'Oathbringer',
          coverAspectRatio: '2/3',
          updatedAt: null,
          seriesIndex: '3',
          coverSource: 'custom',
          authorNames: ['Brandon Sanderson'],
          isAudiobook: false,
        },
      ]);

      const result = await service.getSeriesBooks(2, makeUser());

      expect(result).toEqual([
        {
          id: 1,
          title: 'The Way of Kings',
          coverAspectRatio: '2/3',
          updatedAt: null,
          seriesIndex: '1',
          hasCover: true,
          authors: ['Brandon Sanderson'],
          isAudiobook: false,
          readStatus: null,
        },
        {
          id: 2,
          title: 'Words of Radiance',
          coverAspectRatio: '1/1',
          updatedAt: null,
          seriesIndex: '2',
          hasCover: false,
          authors: [],
          isAudiobook: false,
          readStatus: null,
        },
        {
          id: 3,
          title: 'Oathbringer',
          coverAspectRatio: '2/3',
          updatedAt: null,
          seriesIndex: '3',
          hasCover: true,
          authors: ['Brandon Sanderson'],
          isAudiobook: false,
          readStatus: null,
        },
      ]);
      expect(recRepo.findSeriesBooks).toHaveBeenCalledWith(42, [5, 6], EMPTY_CONTENT_FILTER_RULES, 2);
    });

    it('uses findAccessibleLibraryIds instead of findAll', async () => {
      const { service, bookRepo, recRepo, libraryService } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      recRepo.getSeriesIdentity.mockResolvedValue({ id: 99, name: 'Test Series' });
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5]);
      recRepo.findSeriesBooks.mockResolvedValue([]);

      await service.getSeriesBooks(1, makeUser());

      expect(libraryService.findAccessibleLibraryIds).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
      expect(libraryService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('getAuthorBooks', () => {
    it('throws NotFoundException when the book does not exist', async () => {
      const { service, bookRepo } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(null);

      await expect(service.getAuthorBooks(999, makeUser())).rejects.toThrow(NotFoundException);
    });

    it('verifies user access to the book library', async () => {
      const { service, bookRepo, libraryService, recRepo } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(21);
      recRepo.findAuthorBooks.mockResolvedValue([]);

      await service.getAuthorBooks(1, makeUser(true));

      expect(libraryService.verifyUserAccess).toHaveBeenCalledWith(12, 21, true);
    });

    it('returns books by the same author excluding the current book', async () => {
      const { service, bookRepo, recRepo, libraryService } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5]);
      recRepo.findAuthorBooks.mockResolvedValue([
        {
          bookId: 10,
          title: 'Other Book A',
          coverAspectRatio: '2/3',
          updatedAt: null,
          coverSource: 'extracted',
          authorNames: ['Jane Austen'],
          isAudiobook: false,
        },
        { bookId: 20, title: 'Other Book B', coverAspectRatio: '1/1', updatedAt: null, coverSource: null, authorNames: [], isAudiobook: true },
      ]);

      const result = await service.getAuthorBooks(1, makeUser());

      expect(result).toEqual([
        {
          id: 10,
          title: 'Other Book A',
          coverAspectRatio: '2/3',
          updatedAt: null,
          hasCover: true,
          authors: ['Jane Austen'],
          isAudiobook: false,
          readStatus: null,
        },
        {
          id: 20,
          title: 'Other Book B',
          coverAspectRatio: '1/1',
          updatedAt: null,
          hasCover: false,
          authors: [],
          isAudiobook: true,
          readStatus: null,
        },
      ]);
      expect(recRepo.findAuthorBooks).toHaveBeenCalledWith(1, [5], EMPTY_CONTENT_FILTER_RULES);
    });

    it("attaches the requesting user's read status to each book", async () => {
      const { service, bookRepo, recRepo, libraryService, userBookStatusService } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5]);
      recRepo.findAuthorBooks.mockResolvedValue([
        { bookId: 10, title: 'Read One', coverAspectRatio: '2/3', updatedAt: null, coverSource: null, authorNames: [], isAudiobook: false },
        { bookId: 20, title: 'Untracked', coverAspectRatio: '2/3', updatedAt: null, coverSource: null, authorNames: [], isAudiobook: false },
      ]);
      const status = { status: 'reading', source: 'auto', startedAt: null, finishedAt: null, updatedAt: '2026-01-01T00:00:00.000Z' };
      userBookStatusService.findByBookIds.mockResolvedValue(new Map([[10, status]]));

      const result = await service.getAuthorBooks(1, makeUser());

      expect(userBookStatusService.findByBookIds).toHaveBeenCalledWith(12, [10, 20]);
      expect(result[0].readStatus).toEqual(status);
      expect(result[1].readStatus).toBeNull();
    });

    it('returns empty array when author has no other books', async () => {
      const { service, bookRepo, recRepo, libraryService } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5]);
      recRepo.findAuthorBooks.mockResolvedValue([]);

      const result = await service.getAuthorBooks(1, makeUser());

      expect(result).toEqual([]);
    });

    it('uses findAccessibleLibraryIds instead of findAll', async () => {
      const { service, bookRepo, recRepo, libraryService } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5]);
      recRepo.findAuthorBooks.mockResolvedValue([]);

      await service.getAuthorBooks(1, makeUser());

      expect(libraryService.findAccessibleLibraryIds).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
      expect(libraryService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('content filter enforcement', () => {
    it('passes contentFilters to findAnnCandidates for non-superuser', async () => {
      const { service, recRepo, bookRepo, libraryService } = makeService();
      const filters = { includeTagIds: [10], excludeTagIds: [], includeGenreIds: [], excludeGenreIds: [] };
      const user: RequestUser = { ...makeUser(false), contentFilters: filters };

      bookRepo.findLibraryIdByBookId.mockResolvedValue(3);
      recRepo.getTargetBookData.mockResolvedValue({
        embedding: [0.5],
        seriesId: null,
        seriesName: null,
        rating: null,
        authorNames: [],
        genreTagNames: [],
      });
      libraryService.findAll.mockResolvedValue([{ id: 7 }]);
      recRepo.findAnnCandidates.mockResolvedValue([]);

      await service.getRecommendations(1, user);

      expect(recRepo.findAnnCandidates).toHaveBeenCalledWith([0.5], 1, [7], filters);
    });

    it('passes undefined to findAnnCandidates for superuser (bypasses filters)', async () => {
      const { service, recRepo, bookRepo, libraryService } = makeService();
      const filters = { includeTagIds: [10], excludeTagIds: [], includeGenreIds: [], excludeGenreIds: [] };
      const user: RequestUser = { ...makeUser(true), contentFilters: filters };

      bookRepo.findLibraryIdByBookId.mockResolvedValue(3);
      recRepo.getTargetBookData.mockResolvedValue({
        embedding: [0.5],
        seriesId: null,
        seriesName: null,
        rating: null,
        authorNames: [],
        genreTagNames: [],
      });
      libraryService.findAll.mockResolvedValue([{ id: 7 }]);
      recRepo.findAnnCandidates.mockResolvedValue([]);

      await service.getRecommendations(1, user);

      expect(recRepo.findAnnCandidates).toHaveBeenCalledWith([0.5], 1, [7], undefined);
    });

    it('passes contentFilters to findSeriesBooks for non-superuser', async () => {
      const { service, recRepo, bookRepo, libraryService } = makeService();
      const filters = { includeTagIds: [], excludeTagIds: [5], includeGenreIds: [], excludeGenreIds: [] };
      const user: RequestUser = { ...makeUser(false), contentFilters: filters };

      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      recRepo.getSeriesIdentity.mockResolvedValue({ id: 17, name: 'Wheel of Time' });
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5]);
      recRepo.findSeriesBooks.mockResolvedValue([]);

      await service.getSeriesBooks(1, user);

      expect(recRepo.findSeriesBooks).toHaveBeenCalledWith(17, [5], filters, 1);
    });

    it('passes undefined to findSeriesBooks for superuser', async () => {
      const { service, recRepo, bookRepo, libraryService } = makeService();
      const filters = { includeTagIds: [], excludeTagIds: [5], includeGenreIds: [], excludeGenreIds: [] };
      const user: RequestUser = { ...makeUser(true), contentFilters: filters };

      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      recRepo.getSeriesIdentity.mockResolvedValue({ id: 17, name: 'Wheel of Time' });
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5]);
      recRepo.findSeriesBooks.mockResolvedValue([]);

      await service.getSeriesBooks(1, user);

      expect(recRepo.findSeriesBooks).toHaveBeenCalledWith(17, [5], undefined, 1);
    });

    it('passes contentFilters to findAuthorBooks for non-superuser', async () => {
      const { service, recRepo, bookRepo, libraryService } = makeService();
      const filters = { includeTagIds: [], excludeTagIds: [], includeGenreIds: [3], excludeGenreIds: [] };
      const user: RequestUser = { ...makeUser(false), contentFilters: filters };

      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5]);
      recRepo.findAuthorBooks.mockResolvedValue([]);

      await service.getAuthorBooks(1, user);

      expect(recRepo.findAuthorBooks).toHaveBeenCalledWith(1, [5], filters);
    });

    it('passes undefined to findAuthorBooks for superuser', async () => {
      const { service, recRepo, bookRepo, libraryService } = makeService();
      const filters = { includeTagIds: [], excludeTagIds: [], includeGenreIds: [3], excludeGenreIds: [] };
      const user: RequestUser = { ...makeUser(true), contentFilters: filters };

      bookRepo.findLibraryIdByBookId.mockResolvedValue(5);
      libraryService.findAccessibleLibraryIds.mockResolvedValue([5]);
      recRepo.findAuthorBooks.mockResolvedValue([]);

      await service.getAuthorBooks(1, user);

      expect(recRepo.findAuthorBooks).toHaveBeenCalledWith(1, [5], undefined);
    });
  });

  describe('getAuthorShelf', () => {
    it('returns one card per other series by the author, then standalone books, leaving out the current series', async () => {
      const { service, bookRepo, recRepo, userBookStatusService } = makeService();
      const user = makeUser();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(7);
      recRepo.getSeriesIdentity.mockResolvedValue({ id: 40, name: 'Runebound' });
      recRepo.findAuthorSeries.mockResolvedValue([
        { seriesId: 41, name: 'Rise of the Living Forge', bookCount: 549, readCount: 12, readingCount: 1, coverBookId: 900, isSerial: true },
      ]);
      recRepo.findAuthorBooks.mockResolvedValue([
        {
          bookId: 77,
          title: 'A chicken short story.',
          coverAspectRatio: '2/3',
          updatedAt: null,
          coverSource: null,
          authorNames: ['Actus'],
          isAudiobook: false,
          isComic: false,
        },
      ]);
      recRepo.findCoverBooks.mockResolvedValue([
        {
          bookId: 900,
          coverAspectRatio: '2/3',
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          coverSource: 'embedded',
          authorNames: ['Actus'],
          isAudiobook: false,
          isComic: false,
        },
      ]);
      userBookStatusService.findByBookIds.mockResolvedValue(new Map([[77, { status: 'read' }]]));

      const result = await service.getAuthorShelf(5, user);

      expect(recRepo.findAuthorSeries).toHaveBeenCalledWith(5, 40, [7], user.id, EMPTY_CONTENT_FILTER_RULES);
      expect(recRepo.findAuthorBooks).toHaveBeenCalledWith(5, [7], EMPTY_CONTENT_FILTER_RULES, { standaloneOnly: true, limit: 10 });
      expect(userBookStatusService.findByBookIds).toHaveBeenCalledWith(user.id, [77]);
      expect(result).toEqual([
        {
          kind: 'series',
          seriesId: 41,
          name: 'Rise of the Living Forge',
          authors: ['Actus'],
          bookCount: 549,
          readCount: 12,
          readingCount: 1,
          isSerial: true,
          coverBookId: 900,
          coverUpdatedAt: '2026-01-02T00:00:00.000Z',
          hasCover: true,
          coverAspectRatio: '2/3',
          isAudiobook: false,
          isComic: false,
        },
        expect.objectContaining({ kind: 'book', id: 77, title: 'A chicken short story.', readStatus: { status: 'read' } }),
      ]);
    });

    it('rejects users without access to the book library', async () => {
      const { service, bookRepo, libraryService, recRepo } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(7);
      libraryService.verifyUserAccess.mockRejectedValue(new NotFoundException());

      await expect(service.getAuthorShelf(5, makeUser())).rejects.toThrow(NotFoundException);
      expect(recRepo.findAuthorSeries).not.toHaveBeenCalled();
    });
  });

  describe('getSimilarShelf', () => {
    it('excludes the current series and collapses the rest to one card per series', async () => {
      const { service, bookRepo, recRepo } = makeService();
      const user = makeUser();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(7);
      recRepo.getTargetBookData.mockResolvedValue({
        embedding: [0.1, 0.2],
        seriesId: 40,
        seriesName: 'Runebound',
        rating: null,
        authorNames: [],
        genreTagNames: [],
      });
      recRepo.findAnnCandidates.mockResolvedValue([
        { bookId: 2743, cosineSim: 0.9, seriesId: 50, seriesName: 'Chrysalis', rating: null },
        { bookId: 4208, cosineSim: 0.8, seriesId: 50, seriesName: 'Chrysalis', rating: null },
        { bookId: 12, cosineSim: 0.85, seriesId: null, seriesName: null, rating: null },
        { bookId: 3000, cosineSim: 0.5, seriesId: 60, seriesName: 'Other', rating: null },
      ]);
      recRepo.getCandidateMetadata.mockResolvedValue([]);
      recRepo.findSeriesAggregates.mockResolvedValue([
        { seriesId: 60, name: 'Other', bookCount: 3, readCount: 0, readingCount: 0, coverBookId: 3000 },
        { seriesId: 50, name: 'Chrysalis', bookCount: 1800, readCount: 0, readingCount: 0, coverBookId: 2000 },
      ]);
      recRepo.findCoverBooks.mockResolvedValue([]);
      bookRepo.findRecommendationTitlesByBookIds.mockResolvedValue([
        { id: 12, title: 'Standalone', coverAspectRatio: '2/3', updatedAt: null, hasCover: false, authors: [] },
      ]);

      const result = await service.getSimilarShelf(4329, user);

      expect(recRepo.findAnnCandidates).toHaveBeenCalledWith([0.1, 0.2], 4329, [7], EMPTY_CONTENT_FILTER_RULES, {
        excludeSeriesId: 40,
        limit: 300,
      });
      expect(recRepo.findSeriesAggregates).toHaveBeenCalledWith([50, 60], [7], user.id, EMPTY_CONTENT_FILTER_RULES);
      expect(bookRepo.findRecommendationTitlesByBookIds).toHaveBeenCalledWith([12]);
      expect(result.map((item) => (item.kind === 'series' ? `series:${item.seriesId}` : `book:${item.id}`))).toEqual([
        'series:50',
        'book:12',
        'series:60',
      ]);
    });

    it('returns nothing when no embedding can be built', async () => {
      const { service, bookRepo, recRepo, embedder } = makeService();
      bookRepo.findLibraryIdByBookId.mockResolvedValue(7);
      recRepo.getTargetBookData.mockResolvedValue(null);
      embedder.embedBook.mockResolvedValue(null);

      await expect(service.getSimilarShelf(1, makeUser())).resolves.toEqual([]);
      expect(recRepo.findAnnCandidates).not.toHaveBeenCalled();
    });
  });
});
