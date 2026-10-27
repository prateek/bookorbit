import { boolean, index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const externalRunners = pgTable(
  'external_runners',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    baseUrl: text('base_url').notNull(),
    encryptedToken: text('encrypted_token').notNull(),
    allowPrivateAddress: boolean('allow_private_address').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('external_runners_user_idx').on(t.userId, t.id)],
);
