import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@bookorbit/types';
import { buildNewBooksMessage } from './lib/new-books-message';
import { NewBooksPushNotifier } from './new-books-push.notifier';
import { PushRepository } from './push.repository';
import { PushService } from './push.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationRepository } from '../notification/notification.repository';
import { NotificationGateway } from '../notification/notification.gateway';
import { NewArrivalsController } from './new-arrivals.controller';
import { BookService } from '../book/book.service';
import type { RequestUser } from '../../common/types/request-user';

it('persists each recipient’s exact followed books before sending a grouped push', async () => {
  const notify = vi.fn().mockResolvedValue(true);
  const deliver = vi.fn().mockImplementation(() => {
    expect(notify).toHaveBeenCalledTimes(2);
    return Promise.resolve({ sent: 2, failed: 0, expired: 0 });
  });
  const module = await Test.createTestingModule({
    providers: [
      NewBooksPushNotifier,
      { provide: NotificationService, useValue: { notify } },
      { provide: PushService, useValue: { deliver } },
      {
        provide: PushRepository,
        useValue: {
          summarizeNewBooks: vi.fn().mockResolvedValue([
            { libraryId: 1, seriesId: 7, seriesName: 'Series', count: 2, sampleBookId: 11, bookIds: [11, 12] },
            { libraryId: 1, seriesId: 8, seriesName: 'Other', count: 2, sampleBookId: 21, bookIds: [21, 22] },
          ]),
          findRecipientsForLibrary: vi.fn().mockResolvedValue([1, 2].map((userId) => ({ subscriptionId: userId, userId, settings: {} }))),
          findUnfollowedSeriesByUser: vi.fn().mockResolvedValue(new Map([[2, new Set([8])]])),
          findLaunchTargets: vi.fn().mockResolvedValue([]),
          orderNewBookIds: vi.fn((ids: number[]) => Promise.resolve(ids)),
        },
      },
    ],
  }).compile();
  const notifier = module.get(NewBooksPushNotifier);
  notifier.enqueue(1, [11, 12, 21, 22]);
  await notifier.flush();
  expect(notify.mock.calls[0][0]).toMatchObject({
    type: NotificationType.NewBooks,
    scope: { kind: 'user', userId: 1 },
    meta: { bookIds: [11, 12, 21, 22], seriesId: null },
  });
  expect(notify.mock.calls[1][0]).toMatchObject({ scope: { kind: 'user', userId: 2 }, meta: { bookIds: [11, 12], seriesId: 7 } });
  const deliveries = deliver.mock.calls[0][0];
  expect(deliveries[0].payload.url).toMatch(/^\/new-arrivals\/[a-f0-9-]{36}$/);
  expect(deliveries[0].payload.url).toBe(notify.mock.calls[0][0].actionUrl);
  expect(deliveries[1].payload.url).not.toBe(deliveries[0].payload.url);
  await module.close();
});

it('bounds the cards query to a page and preserves the caller for current access checks', async () => {
  const ids = Array.from({ length: 125 }, (_, index) => index + 1);
  const globalQuery = vi.fn().mockResolvedValue({ items: [{ id: 52 }], total: 1 });
  const module = await Test.createTestingModule({
    controllers: [NewArrivalsController],
    providers: [
      {
        provide: NotificationService,
        useValue: {
          getArrival: vi.fn().mockResolvedValue({ title: 'New books', message: '125 new', bookIds: ids.slice(50, 100), total: 125, seriesId: null }),
        },
      },
      { provide: BookService, useValue: { globalQuery } },
    ],
  }).compile();
  const user = { id: 42 } as RequestUser;
  const result = await module.get(NewArrivalsController).page(user, 'token', { limit: 50, offset: 50 });
  expect(globalQuery).toHaveBeenCalledWith(user, expect.objectContaining({ pagination: { page: 0, size: 50 } }), ids.slice(50, 100));
  expect(result).toMatchObject({ total: 125, offset: 50, hasMore: true, items: [{ id: 52 }] });
  expect(result).not.toHaveProperty('bookIds');
  await module.close();
});

it('looks up arrival snapshots under the authenticated user and handles removed snapshots', async () => {
  const findArrival = vi.fn().mockResolvedValue(null);
  const module = await Test.createTestingModule({
    providers: [NotificationService, { provide: NotificationRepository, useValue: { findArrival } }, { provide: NotificationGateway, useValue: {} }],
  }).compile();
  await expect(module.get(NotificationService).getArrival(42, 'someone-elses-token', 50, 0)).rejects.toBeInstanceOf(NotFoundException);
  expect(findArrival).toHaveBeenCalledWith(42, 'someone-elses-token', 50, 0);
  await module.close();
});

it('keeps a single-book notification targeted when its launch metadata disappears', () => {
  expect(buildNewBooksMessage([{ seriesId: null, seriesName: null, count: 1, sampleBookId: 11 }])?.url).toBe('/book/11');
});
