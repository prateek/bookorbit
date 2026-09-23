import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const webPushMock = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  generateVAPIDKeys: vi.fn(),
}));
vi.mock('web-push', () => webPushMock);

import { PushService, isAllowedPushEndpoint } from './push.service';
import type { PushRecipient } from './push.repository';

const APPLE_ENDPOINT = 'https://web.push.apple.com/QGuQyavXutnMbj1YMqdNg1';

function recipient(id: number, userId = 1): PushRecipient {
  return { subscriptionId: id, userId, endpoint: `${APPLE_ENDPOINT}${id}`, p256dh: 'p', auth: 'a', settings: {} };
}

describe('isAllowedPushEndpoint', () => {
  it.each([
    [APPLE_ENDPOINT, true],
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=abc', true],
    ['http://web.push.apple.com/abc', false],
    ['https://push.apple.com.evil.test/abc', false],
    ['https://localhost/abc', false],
    ['https://web.push.apple.com:8443/abc', false],
    ['not a url', false],
  ])('%s -> %s', (endpoint, expected) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(expected);
  });
});

describe('PushService', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: PushService;

  beforeEach(() => {
    webPushMock.sendNotification.mockReset();
    webPushMock.generateVAPIDKeys.mockReset();
    repo = {
      findVapidKeys: vi.fn().mockResolvedValue({ publicKey: 'pub', privateKey: 'priv' }),
      insertVapidKeysIfAbsent: vi.fn(),
      upsertSubscription: vi.fn(),
      pruneUserSubscriptions: vi.fn(),
      deleteSubscription: vi.fn().mockResolvedValue(true),
      deleteSubscriptionsByIds: vi.fn(),
    };
    service = new PushService(repo as never, { appUrl: 'https://books.example.com' } as never);
  });

  it('generates and persists a VAPID key pair only when none is stored', async () => {
    repo.findVapidKeys.mockResolvedValue(null);
    webPushMock.generateVAPIDKeys.mockReturnValue({ publicKey: 'new-pub', privateKey: 'new-priv' });
    repo.insertVapidKeysIfAbsent.mockResolvedValue({ publicKey: 'new-pub', privateKey: 'new-priv' });

    await expect(service.getPublicKey()).resolves.toBe('new-pub');
    await expect(service.getPublicKey()).resolves.toBe('new-pub');

    expect(webPushMock.generateVAPIDKeys).toHaveBeenCalledTimes(1);
    expect(repo.insertVapidKeysIfAbsent).toHaveBeenCalledWith('new-pub', 'new-priv');
  });

  it('rejects subscriptions that do not point at a browser push service', async () => {
    await expect(service.subscribe(1, { endpoint: 'https://internal.example/hook', keys: { p256dh: 'p', auth: 'a' } }, null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.upsertSubscription).not.toHaveBeenCalled();
  });

  it('stores a subscription for the current user and caps how many a user keeps', async () => {
    await service.subscribe(4, { endpoint: APPLE_ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }, 'Safari');

    expect(repo.upsertSubscription).toHaveBeenCalledWith(4, { endpoint: APPLE_ENDPOINT, p256dh: 'p', auth: 'a', userAgent: 'Safari' });
    expect(repo.pruneUserSubscriptions).toHaveBeenCalledWith(4, 20);
  });

  it('removes only the caller subscription and treats a missing one as done', async () => {
    repo.deleteSubscription.mockResolvedValue(false);
    await expect(service.unsubscribe(4, APPLE_ENDPOINT)).resolves.toBeUndefined();
    expect(repo.deleteSubscription).toHaveBeenCalledWith(4, APPLE_ENDPOINT);
  });

  it('sends the payload with VAPID details and deletes subscriptions the push service reports as gone', async () => {
    webPushMock.sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }))
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { statusCode: 500 }));
    const payload = { title: 'New chapters', body: 'Chrysalis: 2 new', url: '/series/7' };

    const result = await service.deliver([1, 2, 3, 4].map((id) => ({ recipient: recipient(id), payload })));

    expect(result).toEqual({ sent: 1, failed: 1, expired: 2 });
    expect(repo.deleteSubscriptionsByIds).toHaveBeenCalledWith(expect.arrayContaining([2, 3]));
    expect(repo.deleteSubscriptionsByIds.mock.calls[0][0]).toHaveLength(2);
    const [subscription, body, options] = webPushMock.sendNotification.mock.calls[0];
    expect(subscription).toEqual({ endpoint: `${APPLE_ENDPOINT}1`, keys: { p256dh: 'p', auth: 'a' } });
    expect(JSON.parse(body as string)).toEqual(payload);
    expect(options.vapidDetails).toEqual({ subject: 'https://books.example.com', publicKey: 'pub', privateKey: 'priv' });
  });

  it('falls back to a public https subject when the app URL is not https', async () => {
    service = new PushService(repo as never, { appUrl: 'http://localhost:5173' } as never);
    webPushMock.sendNotification.mockResolvedValue({ statusCode: 201 });

    await service.deliver([{ recipient: recipient(1), payload: { title: 't', body: 'b', url: '/' } }]);

    expect(webPushMock.sendNotification.mock.calls[0][2].vapidDetails.subject).toBe('https://bookorbit.app');
  });
});
