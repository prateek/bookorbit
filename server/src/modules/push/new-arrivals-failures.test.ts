import { Test } from '@nestjs/testing';
import { NewBooksPushNotifier } from './new-books-push.notifier';
import { PushRepository } from './push.repository';
import { PushService } from './push.service';
import { NotificationService } from '../notification/notification.service';

async function setup(notify: ReturnType<typeof vi.fn>) {
  const deliver = vi.fn().mockResolvedValue({ sent: 2, failed: 0, expired: 0 });
  const module = await Test.createTestingModule({
    providers: [
      NewBooksPushNotifier,
      { provide: NotificationService, useValue: { notify } },
      { provide: PushService, useValue: { deliver } },
      {
        provide: PushRepository,
        useValue: {
          summarizeNewBooks: vi
            .fn()
            .mockResolvedValue([{ libraryId: 1, seriesId: 7, seriesName: 'Series', count: 2, sampleBookId: 11, bookIds: [11, 12] }]),
          orderNewBookIds: vi.fn().mockResolvedValue([12, 11]),
          findRecipientsForLibrary: vi.fn().mockResolvedValue([1, 2, 3].map((userId) => ({ subscriptionId: userId, userId, settings: {} }))),
          findUnfollowedSeriesByUser: vi.fn().mockResolvedValue(new Map()),
          findLaunchTargets: vi.fn().mockResolvedValue([]),
        },
      },
    ],
  }).compile();
  return { module, deliver, notifier: module.get(NewBooksPushNotifier) };
}

it('isolates a snapshot failure to its recipient without retrying successful recipients', async () => {
  const notify = vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('Insert failed')).mockResolvedValueOnce(true);
  const { module, deliver, notifier } = await setup(notify);
  notifier.enqueue(1, [11, 12]);
  await notifier.flush();
  expect(notify).toHaveBeenCalledTimes(3);
  expect(deliver.mock.calls[0][0].map((delivery: { recipient: { userId: number } }) => delivery.recipient.userId)).toEqual([1, 3]);
  expect(notify.mock.calls[0][0].meta.bookIds).toEqual([12, 11]);
  await notifier.flush();
  expect(notify).toHaveBeenCalledTimes(3);
  await module.close();
});

it('does not send a token when changed preferences prevented its snapshot being stored', async () => {
  const notify = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const { module, deliver, notifier } = await setup(notify);
  notifier.enqueue(1, [11, 12]);
  await notifier.flush();
  expect(deliver.mock.calls[0][0].map((delivery: { recipient: { userId: number } }) => delivery.recipient.userId)).toEqual([1, 3]);
  await module.close();
});
