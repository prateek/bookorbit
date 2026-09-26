import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { SeriesRepository } from './series.repository';
import { SeriesService } from './series.service';

const dialect = new PgDialect();

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'limit']) chain[m] = vi.fn().mockReturnValue(chain);
  return chain;
}

describe('SeriesRepository.countUnreadAfter', () => {
  const db = { select: vi.fn() };
  const repo = new SeriesRepository(db as never);

  beforeEach(() => vi.clearAllMocks());

  it('counts the visible books after this one that the user has not read', async () => {
    const countChain = makeChain([{ unread: 3 }]);
    db.select.mockReturnValueOnce(makeChain([{ seriesIndex: '430', publishedDate: '2026-09-20' }])).mockReturnValueOnce(countChain);

    await expect(repo.countUnreadAfter({ seriesId: 42, bookId: 89, userId: 7, libraryIds: [1] })).resolves.toBe(3);

    const where = dialect.sqlToQuery((countChain.where as ReturnType<typeof vi.fn>).mock.calls[0]![0] as SQL);
    expect(where.sql).toContain('"user_book_status"."status" is null or "user_book_status"."status" <> \'read\'');
    expect(where.sql).toContain('"book_metadata"."published_date" > $');
    expect(where.params).toEqual(expect.arrayContaining([42, 1, 89]));
  });

  it('counts nothing for a book outside the series, without a second query', async () => {
    db.select.mockReturnValueOnce(makeChain([]));

    await expect(repo.countUnreadAfter({ seriesId: 42, bookId: 89, userId: 7, libraryIds: [1] })).resolves.toBe(0);
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

describe('SeriesService.findNextBook unread count', () => {
  const seriesRepo = { findNextReadableBook: vi.fn(), countUnreadAfter: vi.fn() };
  const libraryService = { findAll: vi.fn(), findAccessibleLibraryIds: vi.fn() };
  const user = { id: 7, isSuperuser: false, permissions: [], contentFilters: undefined } as never;
  let service: SeriesService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new SeriesService(seriesRepo as never, {} as never, libraryService as never, {} as never);
    libraryService.findAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  });

  it('returns the count with the next book', async () => {
    seriesRepo.findNextReadableBook.mockResolvedValue({ bookId: 91, title: 'Chapter 431', seriesIndex: '431', fileId: 501, format: 'epub' });
    seriesRepo.countUnreadAfter.mockResolvedValue(4);

    await expect(service.findNextBook(user, 42, 90, { formatGroup: 'epub' })).resolves.toMatchObject({ unreadAfter: 4 });
  });

  it('returns the count for the requesting user even when there is no next file', async () => {
    seriesRepo.findNextReadableBook.mockResolvedValue(null);
    seriesRepo.countUnreadAfter.mockResolvedValue(0);

    await expect(service.findNextBook(user, 42, 90, { formatGroup: 'epub' })).resolves.toEqual({ next: null, unreadAfter: 0 });
    expect(seriesRepo.countUnreadAfter).toHaveBeenCalledWith(expect.objectContaining({ seriesId: 42, bookId: 90, userId: 7, libraryIds: [1, 2] }));
  });
});
