import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { NotificationType } from '@bookorbit/types';
import { PushRepository } from '../src/modules/push/push.repository';
import { NotificationRepository } from '../src/modules/notification/notification.repository';

const databaseUrl = process.env.BOOKORBIT_ARRIVALS_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('new arrivals with PostgreSQL', () => {
  let pool: Pool;
  let pushes: PushRepository;
  let notifications: NotificationRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const db = drizzle(pool);
    pushes = new PushRepository(db as never);
    notifications = new NotificationRepository(db as never);
    await pool.query(`
      CREATE TEMP TABLE books (id integer PRIMARY KEY);
      CREATE TEMP TABLE book_metadata (book_id integer PRIMARY KEY, title text, published_date date);
      CREATE TEMP TABLE book_series (id integer PRIMARY KEY, name text);
      CREATE TEMP TABLE book_series_memberships (book_id integer, series_id integer, series_index text, display_order integer);
      CREATE TEMP TABLE users (id integer PRIMARY KEY, settings jsonb);
      CREATE TEMP TABLE notifications (
        id serial PRIMARY KEY, user_id integer, type varchar(50), title varchar(255), message text, action_url varchar(2048), meta jsonb,
        read boolean DEFAULT false, group_key varchar(255), count integer DEFAULT 1,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
      );
    `);
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE books, book_metadata, book_series, book_series_memberships, users, notifications;
      INSERT INTO users VALUES (1, '{}'), (2, '{}');
      INSERT INTO book_series VALUES (7, 'A'), (8, 'B');
      INSERT INTO books SELECT n FROM generate_series(1,120) n;
      INSERT INTO book_metadata SELECT n, 'Chapter ' || (121-n), '2026-01-01'::date FROM generate_series(1,120) n;
      INSERT INTO book_series_memberships SELECT n, 7, (121-n)::text, 0 FROM generate_series(1,120) n;
    `);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('orders a whole batch before slicing pages, independent of book ID or input chunk order', async () => {
    const ids = Array.from({ length: 120 }, (_, index) => index + 1);
    const ordered = await pushes.orderNewBookIds(ids);
    expect(ordered).toEqual([...ids].reverse());
    await pool.query('INSERT INTO notifications (user_id,type,title,action_url,meta) VALUES ($1,$2,$3,$4,$5)', [
      1,
      NotificationType.NewBooks,
      'New chapters',
      '/new-arrivals/order',
      JSON.stringify({ bookIds: ordered, seriesId: 7 }),
    ]);
    const first = await notifications.findArrival(1, 'order', 50, 0);
    const second = await notifications.findArrival(1, 'order', 50, 50);
    expect(first?.bookIds).toEqual(ordered.slice(0, 50));
    expect(second?.bookIds).toEqual(ordered.slice(50, 100));
    expect(new Set([...first!.bookIds, ...second!.bookIds]).size).toBe(100);
    expect(await notifications.findArrival(2, 'order', 50, 0)).toBeNull();
  });

  it('keeps mixed series together and follows membership chapter order', async () => {
    await pool.query(
      "INSERT INTO books VALUES (201),(202); INSERT INTO book_metadata VALUES (201,'B1','2026-01-01'),(202,'B2','2026-01-01'); INSERT INTO book_series_memberships VALUES (201,8,'1',0),(202,8,'2',0)",
    );
    expect(await pushes.orderNewBookIds([202, 1, 201, 120])).toEqual([120, 1, 201, 202]);
  });

  it('preserves owner-scoped destinations after dismissal and clearing the bell feed', async () => {
    await pool.query('INSERT INTO notifications (user_id,type,title,action_url,meta) VALUES ($1,$2,$3,$4,$5)', [
      1,
      NotificationType.NewBooks,
      'New chapters',
      '/new-arrivals/order',
      JSON.stringify({ bookIds: Array.from({ length: 120 }, (_, index) => 120 - index), seriesId: 7 }),
    ]);
    await pool.query('INSERT INTO notifications (user_id,type,title,action_url,meta) VALUES ($1,$2,$3,$4,$5)', [
      2,
      NotificationType.NewBooks,
      'New chapters',
      '/new-arrivals/dismiss',
      JSON.stringify({ bookIds: [11, 12], seriesId: 7 }),
    ]);
    const before = await notifications.findByUser(2, 20, 0);
    const id = before.items[0].id;
    expect(await notifications.deleteOne(id, 1)).toBe(false);
    expect(await notifications.deleteOne(id, 2)).toBe(true);
    expect((await notifications.findByUser(2, 20, 0)).total).toBe(0);
    expect(await notifications.countUnread(2)).toBe(0);
    expect((await notifications.findArrival(2, 'dismiss', 50, 0))?.bookIds).toEqual([11, 12]);
    await notifications.deleteAllForUser(1);
    expect((await notifications.findByUser(1, 20, 0)).total).toBe(0);
    expect((await notifications.findArrival(1, 'order', 50, 0))?.total).toBe(120);
    await pool.query("UPDATE notifications SET updated_at = now() - interval '31 days'");
    await notifications.deleteOlderThan(new Date(Date.now() - 30 * 86400_000));
    expect(await notifications.findArrival(1, 'order', 50, 0)).toBeNull();
  });
});
