import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Permission } from '@bookorbit/types';

import { chunk } from '../../common/utils/batch.utils';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import {
  bookFiles,
  bookMetadata,
  bookSeries,
  books,
  pushSubscriptions,
  pushVapidKeys,
  userLibraryAccess,
  userPermissions,
  userUnfollowedSeries,
  users,
} from '../../db/schema';

type Db = NodePgDatabase<typeof schema>;

const VAPID_KEYS_ROW_ID = 1;
const BOOK_ID_BATCH_SIZE = 1000;

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface PushRecipient {
  subscriptionId: number;
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  settings: Record<string, unknown>;
}

export interface NewBookGroupRow {
  libraryId: number;
  seriesId: number | null;
  seriesName: string | null;
  count: number;
  sampleBookId: number;
}

export interface BookLaunchTarget {
  bookId: number;
  title: string | null;
  primaryFileId: number | null;
  format: string | null;
}

@Injectable()
export class PushRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findVapidKeys() {
    const [row] = await this.db.select().from(pushVapidKeys).where(eq(pushVapidKeys.id, VAPID_KEYS_ROW_ID)).limit(1);
    return row ?? null;
  }

  /** First writer wins, so concurrent boots cannot end up signing with different key pairs. */
  async insertVapidKeysIfAbsent(publicKey: string, privateKey: string) {
    await this.db.insert(pushVapidKeys).values({ id: VAPID_KEYS_ROW_ID, publicKey, privateKey }).onConflictDoNothing();
    return this.findVapidKeys();
  }

  async upsertSubscription(userId: number, input: PushSubscriptionInput): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, createdAt: sql`now()` },
      });
  }

  /** Keeps only the newest `keep` subscriptions for a user so a client cannot grow the table without bound. */
  async pruneUserSubscriptions(userId: number, keep: number): Promise<void> {
    await this.db.delete(pushSubscriptions).where(
      and(
        eq(pushSubscriptions.userId, userId),
        sql`${pushSubscriptions.id} NOT IN (
          SELECT ${pushSubscriptions.id} FROM ${pushSubscriptions}
          WHERE ${pushSubscriptions.userId} = ${userId}
          ORDER BY ${pushSubscriptions.createdAt} DESC, ${pushSubscriptions.id} DESC
          LIMIT ${keep}
        )`,
      ),
    );
  }

  async deleteSubscription(userId: number, endpoint: string): Promise<boolean> {
    const rows = await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .returning({ id: pushSubscriptions.id });
    return rows.length > 0;
  }

  async deleteSubscriptionsByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, ids));
  }

  /** Subscriptions of active users who can see the library and still hold notification access. */
  async findRecipientsForLibrary(libraryId: number): Promise<PushRecipient[]> {
    const hasLibraryAccess = sql`EXISTS (
      SELECT 1 FROM ${userLibraryAccess}
      WHERE ${userLibraryAccess.userId} = ${users.id} AND ${userLibraryAccess.libraryId} = ${libraryId}
    )`;
    const hasNotificationAccess = sql`EXISTS (
      SELECT 1 FROM ${userPermissions}
      WHERE ${userPermissions.userId} = ${users.id} AND ${userPermissions.permissionName} = ${Permission.NotificationAccess}
    )`;
    const rows = await this.db
      .select({
        subscriptionId: pushSubscriptions.id,
        userId: pushSubscriptions.userId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        settings: users.settings,
      })
      .from(pushSubscriptions)
      .innerJoin(users, eq(users.id, pushSubscriptions.userId))
      .where(and(eq(users.active, true), sql`(${users.isSuperuser} OR (${hasLibraryAccess} AND ${hasNotificationAccess}))`));
    return rows.map((row) => ({ ...row, settings: (row.settings ?? {}) as Record<string, unknown> }));
  }

  /** New books collapsed to one row per library and primary series, so a large import stays a handful of rows. */
  async summarizeNewBooks(bookIds: number[]): Promise<NewBookGroupRow[]> {
    const merged = new Map<string, NewBookGroupRow>();
    for (const ids of chunk(bookIds, BOOK_ID_BATCH_SIZE)) {
      const newBooks = this.db
        .select({
          bookId: books.id,
          libraryId: books.libraryId,
          seriesId: sql<number | null>`(
            SELECT m.series_id FROM book_series_memberships m
            WHERE m.book_id = books.id
            ORDER BY m.display_order, m.series_id
            LIMIT 1
          )`.as('primary_series_id'),
        })
        .from(books)
        .where(and(inArray(books.id, ids), eq(books.status, 'present')))
        .as('new_books');

      const rows = await this.db
        .select({
          libraryId: newBooks.libraryId,
          seriesId: newBooks.seriesId,
          seriesName: bookSeries.name,
          count: sql<number>`count(*)::int`,
          sampleBookId: sql<number>`min(${newBooks.bookId})::int`,
        })
        .from(newBooks)
        .leftJoin(bookSeries, eq(bookSeries.id, newBooks.seriesId))
        .groupBy(newBooks.libraryId, newBooks.seriesId, bookSeries.name);

      for (const row of rows) {
        const key = `${row.libraryId}:${row.seriesId ?? 'none'}`;
        const existing = merged.get(key);
        if (existing) {
          existing.count += row.count;
          existing.sampleBookId = Math.min(existing.sampleBookId, row.sampleBookId);
        } else {
          merged.set(key, { ...row });
        }
      }
    }
    return [...merged.values()];
  }

  /** Series each user unfollowed, limited to the given ones; users with none are absent from the map. */
  async findUnfollowedSeriesByUser(userIds: number[], seriesIds: number[]): Promise<Map<number, Set<number>>> {
    const byUser = new Map<number, Set<number>>();
    if (userIds.length === 0 || seriesIds.length === 0) return byUser;
    for (const ids of chunk(seriesIds, BOOK_ID_BATCH_SIZE)) {
      const rows = await this.db
        .select({ userId: userUnfollowedSeries.userId, seriesId: userUnfollowedSeries.seriesId })
        .from(userUnfollowedSeries)
        .where(and(inArray(userUnfollowedSeries.userId, userIds), inArray(userUnfollowedSeries.seriesId, ids)));
      for (const row of rows) {
        const seriesForUser = byUser.get(row.userId) ?? new Set<number>();
        seriesForUser.add(row.seriesId);
        byUser.set(row.userId, seriesForUser);
      }
    }
    return byUser;
  }

  async findLaunchTargets(bookIds: number[]): Promise<BookLaunchTarget[]> {
    if (bookIds.length === 0) return [];
    return this.db
      .select({
        bookId: books.id,
        title: bookMetadata.title,
        primaryFileId: books.primaryFileId,
        format: bookFiles.format,
      })
      .from(books)
      .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
      .leftJoin(bookFiles, eq(bookFiles.id, books.primaryFileId))
      .where(inArray(books.id, bookIds));
  }
}
