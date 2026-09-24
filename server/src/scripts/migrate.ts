import { existsSync } from 'fs';
import { join } from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { createPostgresClientConfig } from '../db/postgres-connection-config';
import { reconcileMigrationLedgerTimestamps } from './migration-ledger-compatibility';
import { findSkippedMigrations, readJournalMigrations } from './migration-ledger-verification';
import { installPostgresExtensions } from './postgres-extensions';
import { prepareLegacySeriesIndexColumns } from './series-index-migration-compatibility';

function resolveMigrationsFolder(): string {
  const candidates = [
    join(__dirname, '..', '..', 'migrations'),
    join(__dirname, '..', 'db', 'migrations'),
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'src', 'db', 'migrations'),
  ];

  const match = candidates.find((path) => existsSync(path));
  if (!match) {
    throw new Error(`Unable to locate migrations folder. Checked: ${candidates.join(', ')}`);
  }
  return match;
}

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool(
    createPostgresClientConfig(connectionString, {
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    }),
  );

  try {
    await installPostgresExtensions(pool);
    const migrationsFolder = resolveMigrationsFolder();
    const migrations = readJournalMigrations(migrationsFolder);
    await reconcileMigrationLedgerTimestamps(pool, migrations);
    await prepareLegacySeriesIndexColumns(pool);

    await migrate(drizzle(pool), { migrationsFolder });

    // Drizzle only applies journal entries newer than the latest applied created_at,
    // so an entry stamped earlier than an already-applied one is silently skipped.
    if ((await findSkippedMigrations(pool, migrations)).length > 0) {
      process.exitCode = 1;
      return;
    }

    console.log(`Migrations applied successfully from ${migrationsFolder}`);
  } finally {
    await pool.end();
  }
}

void runMigrations();
