import type { MigrationMeta } from 'drizzle-orm/migrator';
import type { Pool, PoolClient } from 'pg';

import { sanitizeLogValue } from '../common/utils/log-sanitize.utils';

export type OrderedMigration = Pick<MigrationMeta, 'sql' | 'hash' | 'folderMillis'> & { tag: string };

// Drizzle applies only journal entries stamped after the newest applied created_at. An entry that
// arrives stamped earlier (an upstream migration merged after one of ours ran) would never run, so
// apply those here, in journal order, before drizzle handles the newer ones.
export async function applyOutOfOrderMigrations(pool: Pick<Pool, 'query' | 'connect'>, migrations: readonly OrderedMigration[]): Promise<string[]> {
  const ledgerExists = await pool.query<{ exists: boolean }>(`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`);
  if (!ledgerExists.rows[0]?.exists) return [];

  const ledger = await pool.query<{ hash: string; created_at: string | null }>('SELECT hash, created_at FROM drizzle.__drizzle_migrations');
  if (ledger.rows.length === 0) return [];

  const appliedHashes = new Set(ledger.rows.map((row) => row.hash));
  const newestApplied = Math.max(...ledger.rows.map((row) => Number(row.created_at ?? 0)));
  const pending = migrations.filter((migration) => !appliedHashes.has(migration.hash) && migration.folderMillis <= newestApplied);
  if (pending.length === 0) return [];

  const tags = pending.map((migration) => migration.tag);
  const startedAt = Date.now();
  console.log(
    `[db.migrate_out_of_order] [start] count=${pending.length} migrations=${tags.join(',')} newestApplied=${newestApplied} - applying migrations stamped before the newest applied one`,
  );

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const migration of pending) {
      for (const statement of migration.sql) {
        if (statement.trim()) await client.query(statement);
      }
      await client.query('INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)', [migration.hash, migration.folderMillis]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    const errorClass = error instanceof Error ? error.constructor.name : 'Unknown';
    console.error(
      `[db.migrate_out_of_order] [fail] count=${pending.length} migrations=${tags.join(',')} durationMs=${Date.now() - startedAt} errorClass=${errorClass} error="${sanitizeLogValue(message)}" - out-of-order migrations failed`,
    );
    throw error;
  } finally {
    client.release();
  }

  console.log(
    `[db.migrate_out_of_order] [end] count=${pending.length} migrations=${tags.join(',')} durationMs=${Date.now() - startedAt} - out-of-order migrations applied`,
  );
  return tags;
}
