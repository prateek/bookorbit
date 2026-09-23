import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { users } from './auth';

/**
 * Browser push subscriptions. An endpoint identifies one browser install, so it is unique across
 * users: re-subscribing on a shared device moves the row to whoever subscribed last.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: varchar('endpoint', { length: 2048 }).notNull(),
    p256dh: varchar('p256dh', { length: 255 }).notNull(),
    auth: varchar('auth', { length: 255 }).notNull(),
    userAgent: varchar('user_agent', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('push_subscriptions_endpoint_uidx').on(t.endpoint), index('push_subscriptions_user_id_idx').on(t.userId)],
);

/**
 * Single-row store for the server's VAPID key pair. Kept out of `app_settings` because that table
 * is listed to admins verbatim and the private key must never leave the server.
 */
export const pushVapidKeys = pgTable(
  'push_vapid_keys',
  {
    id: integer('id').primaryKey(),
    publicKey: varchar('public_key', { length: 255 }).notNull(),
    privateKey: varchar('private_key', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [check('push_vapid_keys_singleton_chk', sql`${t.id} = 1`)],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
export type PushVapidKeysRow = typeof pushVapidKeys.$inferSelect;
