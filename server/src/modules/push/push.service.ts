import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as webPush from 'web-push';

import { mapWithConcurrency } from '../../common/utils/batch.utils';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { appConfig } from '../../config/config';
import type { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';
import { PushRepository, type PushRecipient } from './push.repository';

/** Only real browser push services are accepted, so a subscription can never point the server at an arbitrary host. */
const PUSH_SERVICE_HOST_SUFFIXES = [
  'push.apple.com',
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
];
const MAX_SUBSCRIPTIONS_PER_USER = 20;
const SEND_CONCURRENCY = 8;
const SEND_TIMEOUT_MS = 10_000;
const PUSH_TTL_SECONDS = 60 * 60 * 24;
const FALLBACK_VAPID_SUBJECT = 'https://bookorbit.app';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushDeliveryResult {
  sent: number;
  failed: number;
  expired: number;
}

interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function isExpiredSubscriptionError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: unknown } | null)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private vapidKeys: Promise<VapidKeyPair> | null = null;

  constructor(
    private readonly repo: PushRepository,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  async getPublicKey(): Promise<string> {
    return (await this.loadVapidKeys()).publicKey;
  }

  async subscribe(userId: number, dto: SavePushSubscriptionDto, userAgent: string | null): Promise<void> {
    const startedAt = Date.now();
    if (!isAllowedPushEndpoint(dto.endpoint)) {
      throw new BadRequestException('Push endpoint is not a supported browser push service');
    }
    await this.repo.upsertSubscription(userId, {
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: userAgent ? userAgent.slice(0, 512) : null,
    });
    await this.repo.pruneUserSubscriptions(userId, MAX_SUBSCRIPTIONS_PER_USER);
    this.logger.log(`[push.subscribe] [end] userId=${userId} durationMs=${Date.now() - startedAt} - push subscription saved`);
  }

  async unsubscribe(userId: number, endpoint: string): Promise<void> {
    const startedAt = Date.now();
    const deleted = await this.repo.deleteSubscription(userId, endpoint);
    this.logger.log(`[push.unsubscribe] [end] userId=${userId} durationMs=${Date.now() - startedAt} deleted=${deleted} - push subscription removed`);
  }

  /** Sends one payload to each recipient and drops subscriptions the push service reports as gone. */
  async deliver(recipients: Array<{ recipient: PushRecipient; payload: PushPayload }>): Promise<PushDeliveryResult> {
    const result: PushDeliveryResult = { sent: 0, failed: 0, expired: 0 };
    if (recipients.length === 0) return result;

    const keys = await this.loadVapidKeys();
    const vapidDetails = { subject: this.vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey };
    const expiredIds: number[] = [];

    await mapWithConcurrency(recipients, SEND_CONCURRENCY, async ({ recipient, payload }) => {
      const startedAt = Date.now();
      try {
        await webPush.sendNotification(
          { endpoint: recipient.endpoint, keys: { p256dh: recipient.p256dh, auth: recipient.auth } },
          JSON.stringify(payload),
          { vapidDetails, TTL: PUSH_TTL_SECONDS, timeout: SEND_TIMEOUT_MS, urgency: 'normal' },
        );
        result.sent++;
      } catch (err) {
        if (isExpiredSubscriptionError(err)) {
          expiredIds.push(recipient.subscriptionId);
          result.expired++;
          return;
        }
        result.failed++;
        const statusCode = (err as { statusCode?: unknown } | null)?.statusCode;
        this.logger.warn(
          `[push.send] [fail] userId=${recipient.userId} subscriptionId=${recipient.subscriptionId} durationMs=${Date.now() - startedAt} statusCode=${typeof statusCode === 'number' ? statusCode : 'none'} errorClass=${err instanceof Error ? err.name : 'Error'} error="${sanitizeLogValue(err instanceof Error ? err.message : String(err))}" - push delivery failed`,
        );
      }
    });

    await this.repo.deleteSubscriptionsByIds(expiredIds);
    return result;
  }

  private vapidSubject(): string {
    return this.app.appUrl.startsWith('https://') ? this.app.appUrl : FALLBACK_VAPID_SUBJECT;
  }

  private loadVapidKeys(): Promise<VapidKeyPair> {
    this.vapidKeys ??= this.resolveVapidKeys().catch((err: unknown) => {
      this.vapidKeys = null;
      throw err;
    });
    return this.vapidKeys;
  }

  private async resolveVapidKeys(): Promise<VapidKeyPair> {
    const existing = await this.repo.findVapidKeys();
    if (existing) return { publicKey: existing.publicKey, privateKey: existing.privateKey };

    const generated = webPush.generateVAPIDKeys();
    const stored = await this.repo.insertVapidKeysIfAbsent(generated.publicKey, generated.privateKey);
    if (!stored) throw new InternalServerErrorException('VAPID keys could not be persisted');
    this.logger.log(`[push.vapid_keys] [end] generated=${stored.publicKey === generated.publicKey} - VAPID key pair ready`);
    return { publicKey: stored.publicKey, privateKey: stored.privateKey };
  }
}
