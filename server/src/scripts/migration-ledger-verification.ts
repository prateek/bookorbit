import { readFileSync } from 'fs';
import { join } from 'path';
import { type MigrationMeta, readMigrationFiles } from 'drizzle-orm/migrator';
import type { Pool } from 'pg';

export type JournalMigration = Pick<MigrationMeta, 'folderMillis' | 'hash'> & {
  tag: string;
};

type MigrationJournal = {
  entries: Array<{ tag: string }>;
};

export function readJournalMigrations(migrationsFolder: string): JournalMigration[] {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as MigrationJournal;
  // readMigrationFiles returns one entry per journal entry, in journal order.
  return readMigrationFiles({ migrationsFolder }).map((migration, index) => ({
    tag: journal.entries[index].tag,
    hash: migration.hash,
    folderMillis: migration.folderMillis,
  }));
}

export async function findSkippedMigrations(
  pool: Pick<Pool, 'query'>,
  migrations: readonly Pick<JournalMigration, 'hash' | 'tag'>[],
): Promise<string[]> {
  const startedAt = Date.now();
  const ledger = await pool.query<{ hash: string }>('SELECT hash FROM drizzle.__drizzle_migrations');
  const appliedHashes = new Set(ledger.rows.map((row) => row.hash));
  const skipped = migrations.filter((migration) => !appliedHashes.has(migration.hash)).map((migration) => migration.tag);

  if (skipped.length > 0) {
    console.error(
      `[db.migrate] [fail] journalEntries=${migrations.length} missingCount=${skipped.length} missing=${skipped.join(',')} durationMs=${Date.now() - startedAt} errorClass=SkippedMigration error="journal entries missing from the migration ledger" - migrations were skipped`,
    );
  }
  return skipped;
}
