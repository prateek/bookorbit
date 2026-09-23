import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { NOTIFICATION_TYPE_META, NotificationType, isNotificationAllowed, resolveNotificationLevel } from '@bookorbit/types';
import type { NotificationPreferences } from '@bookorbit/types';

import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { buildNewBooksMessage, mergeGroupsBySeries, totalNewBooks, type NewBookGroup } from './lib/new-books-message';
import { PushRepository, type NewBookGroupRow, type PushRecipient } from './push.repository';
import { PushService, type PushPayload } from './push.service';

/** A scan reports books one at a time; waiting for a quiet spell turns a batch into one notification. */
const QUIET_WINDOW_MS = 30_000;
/** Upper bound so a long-running import still notifies while it is going. */
const MAX_WAIT_MS = 5 * 60_000;
/** Beyond this the batch is summarised from what was collected; memory stays bounded during a first import. */
const MAX_PENDING_BOOK_IDS = 50_000;

interface UserBatch {
  groups: NewBookGroup[];
  libraryIds: Set<number>;
  recipients: PushRecipient[];
}

function allowsNewBookPush(settings: Record<string, unknown>): boolean {
  const meta = NOTIFICATION_TYPE_META[NotificationType.ScanCompleted];
  const prefs = settings.notificationPreferences as NotificationPreferences | undefined;
  return isNotificationAllowed(resolveNotificationLevel(prefs?.[meta.category]), meta.severity);
}

@Injectable()
export class NewBooksPushNotifier implements OnModuleDestroy {
  private readonly logger = new Logger(NewBooksPushNotifier.name);
  private pending = new Map<number, Set<number>>();
  private pendingCount = 0;
  private firstQueuedAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly repo: PushRepository,
    private readonly pushService: PushService,
  ) {}

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Records books that just became visible in a library. Cheap and synchronous so scan loops are not slowed down. */
  enqueue(libraryId: number, bookIds: readonly number[]): void {
    if (bookIds.length === 0) return;
    let ids = this.pending.get(libraryId);
    if (!ids) {
      ids = new Set();
      this.pending.set(libraryId, ids);
    }
    for (const id of bookIds) {
      if (this.pendingCount >= MAX_PENDING_BOOK_IDS) break;
      if (!ids.has(id)) {
        ids.add(id);
        this.pendingCount++;
      }
    }

    const now = Date.now();
    this.firstQueuedAt ??= now;
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.max(0, Math.min(QUIET_WINDOW_MS, this.firstQueuedAt + MAX_WAIT_MS - now));
    this.timer = setTimeout(() => void this.flush(), delay);
    this.timer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const batch = this.pending;
    this.pending = new Map();
    this.pendingCount = 0;
    this.firstQueuedAt = null;
    if (batch.size === 0) return;

    const event = 'push.new_books';
    const startedAt = Date.now();
    const bookIds = [...batch.values()].flatMap((ids) => [...ids]);
    this.logger.log(`[${event}] [start] libraryCount=${batch.size} bookCount=${bookIds.length} - new book push started`);

    try {
      const groupsByLibrary = this.groupByLibrary(await this.repo.summarizeNewBooks(bookIds));
      const users = await this.collectUserBatches(groupsByLibrary);
      const deliveries = await this.buildDeliveries(users);
      const result = await this.pushService.deliver(deliveries);
      this.logger.log(
        `[${event}] [end] libraryCount=${batch.size} bookCount=${bookIds.length} durationMs=${Date.now() - startedAt} userCount=${users.size} sent=${result.sent} failed=${result.failed} expired=${result.expired} - new book push completed`,
      );
    } catch (err) {
      this.logger.warn(
        `[${event}] [fail] libraryCount=${batch.size} bookCount=${bookIds.length} durationMs=${Date.now() - startedAt} errorClass=${err instanceof Error ? err.name : 'Error'} error="${sanitizeLogValue(err instanceof Error ? err.message : String(err))}" - new book push failed`,
      );
    }
  }

  private groupByLibrary(rows: NewBookGroupRow[]): Map<number, NewBookGroup[]> {
    const byLibrary = new Map<number, NewBookGroup[]>();
    for (const row of rows) {
      const groups = byLibrary.get(row.libraryId) ?? [];
      groups.push({ seriesId: row.seriesId, seriesName: row.seriesName, count: row.count, sampleBookId: row.sampleBookId });
      byLibrary.set(row.libraryId, groups);
    }
    return byLibrary;
  }

  private async collectUserBatches(groupsByLibrary: Map<number, NewBookGroup[]>): Promise<Map<number, UserBatch>> {
    const users = new Map<number, UserBatch>();
    for (const [libraryId, groups] of groupsByLibrary) {
      const recipients = await this.repo.findRecipientsForLibrary(libraryId);
      for (const recipient of recipients) {
        if (!allowsNewBookPush(recipient.settings)) continue;
        let user = users.get(recipient.userId);
        if (!user) {
          user = { groups: [], libraryIds: new Set(), recipients: [] };
          users.set(recipient.userId, user);
        }
        if (!user.libraryIds.has(libraryId)) {
          user.libraryIds.add(libraryId);
          user.groups.push(...groups);
        }
        if (!user.recipients.some((r) => r.subscriptionId === recipient.subscriptionId)) user.recipients.push(recipient);
      }
    }
    await this.dropUnfollowedSeries(users);
    for (const user of users.values()) user.groups = mergeGroupsBySeries(user.groups);
    return users;
  }

  /** A user who unfollowed a series hears nothing about its new chapters; one query covers the batch. */
  private async dropUnfollowedSeries(users: Map<number, UserBatch>): Promise<void> {
    const seriesIds = new Set<number>();
    for (const user of users.values()) for (const group of user.groups) if (group.seriesId != null) seriesIds.add(group.seriesId);
    const unfollowedByUser = await this.repo.findUnfollowedSeriesByUser([...users.keys()], [...seriesIds]);
    for (const [userId, unfollowed] of unfollowedByUser) {
      const user = users.get(userId);
      if (!user) continue;
      user.groups = user.groups.filter((group) => group.seriesId == null || !unfollowed.has(group.seriesId));
      if (user.groups.length === 0) users.delete(userId);
    }
  }

  private async buildDeliveries(users: Map<number, UserBatch>): Promise<Array<{ recipient: PushRecipient; payload: PushPayload }>> {
    const singleBookIds = [...users.values()].filter((user) => totalNewBooks(user.groups) === 1).map((user) => user.groups[0].sampleBookId);
    const launchTargets = new Map((await this.repo.findLaunchTargets([...new Set(singleBookIds)])).map((target) => [target.bookId, target]));

    const deliveries: Array<{ recipient: PushRecipient; payload: PushPayload }> = [];
    for (const user of users.values()) {
      const launchTarget = totalNewBooks(user.groups) === 1 ? launchTargets.get(user.groups[0].sampleBookId) : null;
      const message = buildNewBooksMessage(user.groups, launchTarget);
      if (!message) continue;
      for (const recipient of user.recipients) deliveries.push({ recipient, payload: message });
    }
    return deliveries;
  }
}
