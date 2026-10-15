import type { ReadingAttemptOrigin, ReadingAttemptOutcome, ReadStatus } from '@bookorbit/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReadingAttemptService } from './reading-attempt.service';

type Attempt = {
  id: number;
  userId: number;
  bookId: number;
  startedOn: string | null;
  endedOn: string | null;
  outcome: ReadingAttemptOutcome | null;
  origin: ReadingAttemptOrigin;
};

function makeAttemptStore() {
  const rows: Attempt[] = [];
  const projections: Array<{ status: ReadStatus }> = [];
  let nextId = 1;
  const forBook = (userId: number, bookId: number) => rows.filter((row) => row.userId === userId && row.bookId === bookId);

  const repo = {
    transaction: vi.fn((callback: (tx: object) => Promise<unknown>) => callback({})),
    findActive: vi.fn((_tx: object, userId: number, bookId: number) => Promise.resolve(forBook(userId, bookId).find((row) => row.outcome === null))),
    findLatest: vi.fn((_tx: object, userId: number, bookId: number) => Promise.resolve(forBook(userId, bookId).at(-1))),
    hasCompleted: vi.fn((_tx: object, userId: number, bookId: number) =>
      Promise.resolve(forBook(userId, bookId).some((row) => row.outcome === 'completed')),
    ),
    create: vi.fn((_tx: object, values: Omit<Attempt, 'id'>) => {
      const row = { ...values, id: nextId++ };
      rows.push(row);
      return Promise.resolve(row);
    }),
    createActive: vi.fn((_tx: object, values: Pick<Attempt, 'userId' | 'bookId' | 'startedOn' | 'origin'>) =>
      repo.create(_tx, { ...values, endedOn: null, outcome: null }),
    ),
    update: vi.fn((_tx: object, _userId: number, _bookId: number, id: number, patch: Partial<Attempt>) => {
      const row = rows.find((item) => item.id === id);
      if (row) Object.assign(row, patch);
      return Promise.resolve(row ?? null);
    }),
    findStatus: vi.fn(() => Promise.resolve(null)),
    project: vi.fn((_tx: object, _userId: number, _bookId: number, projection: { status: ReadStatus }) => {
      projections.push(projection);
      return Promise.resolve();
    }),
  };
  return { repo, rows, projections };
}

const finishedChapter = { userId: 1, bookId: 10, origin: 'bookorbit' as const, readThreshold: 0.25, strongRereadEvidence: false };

describe('ReadingAttemptService turning a finished book into a reread', () => {
  let store: ReturnType<typeof makeAttemptStore>;
  let service: ReadingAttemptService;

  beforeEach(async () => {
    store = makeAttemptStore();
    service = new ReadingAttemptService(store.repo as never, { notifyChanged: vi.fn() } as never);
    await store.repo.create({}, { userId: 1, bookId: 10, startedOn: '2026-10-01', endedOn: '2026-10-01', outcome: 'completed', origin: 'bookorbit' });
  });

  it('reopens the book as a reread when a meaningful session ends below the finish threshold', async () => {
    const result = await service.recordActivity({
      ...finishedChapter,
      occurredOn: '2026-10-15',
      progress: 40,
      finishThreshold: 98,
      meaningfulActivity: true,
    });

    expect(result?.status).toBe('rereading');
    expect(store.rows).toHaveLength(2);
    expect(store.rows[1]).toMatchObject({ startedOn: '2026-10-15', endedOn: null, outcome: null });
    expect(store.projections.at(-1)?.status).toBe('rereading');
  });

  it('reopens the book when a finish threshold of 100 meets the reader end position of 99.99', async () => {
    const result = await service.recordActivity({
      ...finishedChapter,
      occurredOn: '2026-10-15',
      progress: 99.99,
      finishThreshold: 100,
      meaningfulActivity: true,
    });

    expect(result?.status).toBe('rereading');
    expect(store.rows.filter((row) => row.outcome === null)).toHaveLength(1);
  });

  it('keeps the book read when a meaningful session ends at the finish threshold', async () => {
    const result = await service.recordActivity({
      ...finishedChapter,
      occurredOn: '2026-10-15',
      progress: 99,
      finishThreshold: 98,
      meaningfulActivity: true,
    });

    expect(result?.status).toBe('read');
    expect(store.rows).toHaveLength(1);
  });

  it.each([2.5, 40, 97])('leaves the book read when progress reaches %s%% without a meaningful session', async (progress) => {
    const result = await service.recordActivity({
      ...finishedChapter,
      occurredOn: '2026-10-15',
      progress,
      finishThreshold: 98,
      meaningfulActivity: false,
    });

    expect(result).toBeNull();
    expect(store.rows).toHaveLength(1);
    expect(store.projections).toHaveLength(0);
  });
});
