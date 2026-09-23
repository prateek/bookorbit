import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('web-push', () => ({ sendNotification: vi.fn(), generateVAPIDKeys: vi.fn() }));

import { NewBooksPushNotifier } from './new-books-push.notifier';
import type { PushRecipient } from './push.repository';

function recipient(subscriptionId: number, userId: number, settings: Record<string, unknown> = {}): PushRecipient {
  return { subscriptionId, userId, endpoint: `https://web.push.apple.com/${subscriptionId}`, p256dh: 'p', auth: 'a', settings };
}

describe('NewBooksPushNotifier', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let pushService: { deliver: ReturnType<typeof vi.fn> };
  let notifier: NewBooksPushNotifier;

  beforeEach(() => {
    vi.useFakeTimers();
    repo = {
      summarizeNewBooks: vi.fn().mockResolvedValue([]),
      findRecipientsForLibrary: vi.fn().mockResolvedValue([]),
      findLaunchTargets: vi.fn().mockResolvedValue([]),
      findUnfollowedSeriesByUser: vi.fn().mockResolvedValue(new Map()),
    };
    pushService = { deliver: vi.fn().mockResolvedValue({ sent: 0, failed: 0, expired: 0 }) };
    notifier = new NewBooksPushNotifier(repo as never, pushService as never);
  });

  afterEach(() => {
    notifier.onModuleDestroy();
    vi.useRealTimers();
  });

  it('waits for a quiet spell and flushes one batch for all queued books', async () => {
    notifier.enqueue(1, [10]);
    await vi.advanceTimersByTimeAsync(20_000);
    notifier.enqueue(1, [11, 10]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(repo.summarizeNewBooks).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(repo.summarizeNewBooks).toHaveBeenCalledTimes(1);
    expect(repo.summarizeNewBooks).toHaveBeenCalledWith([10, 11]);
  });

  it('flushes a long-running batch once the maximum wait is reached', async () => {
    for (let second = 0; second < 6 * 60; second += 10) {
      notifier.enqueue(1, [second]);
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(repo.summarizeNewBooks).toHaveBeenCalled();
  });

  it('sends each user one notification covering only the libraries they can access', async () => {
    repo.summarizeNewBooks.mockResolvedValue([
      { libraryId: 1, seriesId: 7, seriesName: 'Chrysalis', count: 2, sampleBookId: 11 },
      { libraryId: 2, seriesId: 3, seriesName: 'The Sixth School', count: 1, sampleBookId: 20 },
    ]);
    repo.findRecipientsForLibrary
      .mockResolvedValueOnce([recipient(100, 1), recipient(101, 1), recipient(200, 2)])
      .mockResolvedValueOnce([recipient(100, 1)]);

    notifier.enqueue(1, [11, 12]);
    notifier.enqueue(2, [20]);
    await notifier.flush();

    expect(repo.findRecipientsForLibrary.mock.calls).toEqual([[1], [2]]);
    const deliveries = pushService.deliver.mock.calls[0][0] as Array<{ recipient: PushRecipient; payload: { body: string; url: string } }>;
    const byUser = new Map<number, Array<{ body: string; url: string }>>();
    for (const d of deliveries) byUser.set(d.recipient.userId, [...(byUser.get(d.recipient.userId) ?? []), d.payload]);

    expect(byUser.get(1)).toEqual([
      { title: 'New chapters', body: 'Chrysalis: 2 new, The Sixth School: 1 new', url: '/' },
      { title: 'New chapters', body: 'Chrysalis: 2 new, The Sixth School: 1 new', url: '/' },
    ]);
    expect(byUser.get(2)).toEqual([{ title: 'New chapters', body: 'Chrysalis: 2 new', url: '/series/7' }]);
  });

  it('deep-links a single new book into the reader', async () => {
    repo.summarizeNewBooks.mockResolvedValue([{ libraryId: 1, seriesId: 7, seriesName: 'Chrysalis', count: 1, sampleBookId: 11 }]);
    repo.findRecipientsForLibrary.mockResolvedValue([recipient(100, 1)]);
    repo.findLaunchTargets.mockResolvedValue([{ bookId: 11, title: 'Chapter 12', primaryFileId: 40, format: 'epub' }]);

    notifier.enqueue(1, [11]);
    await notifier.flush();

    expect(repo.findLaunchTargets).toHaveBeenCalledWith([11]);
    expect(pushService.deliver.mock.calls[0][0][0].payload).toEqual({
      title: 'New chapter',
      body: 'Chrysalis: Chapter 12',
      url: '/read/11/40?format=epub',
    });
  });

  it('leaves out series a user unfollowed and skips users left with nothing new', async () => {
    repo.summarizeNewBooks.mockResolvedValue([
      { libraryId: 1, seriesId: 7, seriesName: 'Chrysalis', count: 2, sampleBookId: 11 },
      { libraryId: 1, seriesId: 3, seriesName: 'The Sixth School', count: 1, sampleBookId: 20 },
    ]);
    repo.findRecipientsForLibrary.mockResolvedValue([recipient(100, 1), recipient(200, 2), recipient(300, 3)]);
    repo.findLaunchTargets.mockResolvedValue([{ bookId: 20, title: 'Chapter 3', primaryFileId: 50, format: 'epub' }]);
    repo.findUnfollowedSeriesByUser.mockResolvedValue(
      new Map([
        [1, new Set([7])],
        [3, new Set([3, 7])],
      ]),
    );

    notifier.enqueue(1, [11, 12, 20]);
    await notifier.flush();

    expect(repo.findUnfollowedSeriesByUser).toHaveBeenCalledWith([1, 2, 3], [7, 3]);
    const deliveries = pushService.deliver.mock.calls[0][0] as Array<{ recipient: PushRecipient; payload: { body: string } }>;
    expect(deliveries.map((d) => [d.recipient.userId, d.payload.body])).toEqual([
      [1, 'The Sixth School: Chapter 3'],
      [2, 'Chrysalis: 2 new, The Sixth School: 1 new'],
    ]);
    expect(repo.findLaunchTargets).toHaveBeenCalledWith([20]);
  });

  it('skips users who turned scanning notifications off', async () => {
    repo.summarizeNewBooks.mockResolvedValue([{ libraryId: 1, seriesId: 7, seriesName: 'Chrysalis', count: 2, sampleBookId: 11 }]);
    repo.findRecipientsForLibrary.mockResolvedValue([recipient(100, 1, { notificationPreferences: { scanning: 'off' } })]);

    notifier.enqueue(1, [11, 12]);
    await notifier.flush();

    expect(pushService.deliver).toHaveBeenCalledWith([]);
  });

  it('logs and swallows failures so the scan is never affected', async () => {
    repo.summarizeNewBooks.mockRejectedValue(new Error('db down'));
    notifier.enqueue(1, [11]);
    await expect(notifier.flush()).resolves.toBeUndefined();
    expect(pushService.deliver).not.toHaveBeenCalled();
  });
});
