import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Pool } from 'pg';

import { findSkippedMigrations, readJournalMigrations } from './migration-ledger-verification';

const migrations = [
  { tag: '0000_first', hash: 'first' },
  { tag: '0001_second', hash: 'second' },
  { tag: '0002_third', hash: 'third' },
] as const;

function createPool(appliedHashes: string[]) {
  const query = vi.fn(() => Promise.resolve({ rows: appliedHashes.map((hash) => ({ hash })) }));
  return { pool: { query } as unknown as Pick<Pool, 'query'>, query };
}

describe('findSkippedMigrations', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('returns nothing when every journal migration is in the ledger', async () => {
    const { pool, query } = createPool(['first', 'second', 'third', 'removed-from-journal']);

    await expect(findSkippedMigrations(pool, migrations)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledWith('SELECT hash FROM drizzle.__drizzle_migrations');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('reports journal migrations missing from the ledger in journal order', async () => {
    const { pool } = createPool(['third', 'first']);

    await expect(findSkippedMigrations(pool, [...migrations, { tag: '0003_fourth', hash: 'fourth' }])).resolves.toEqual([
      '0001_second',
      '0003_fourth',
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[db\.migrate\] \[fail\] journalEntries=4 missingCount=2 missing=0001_second,0003_fourth durationMs=\d+ errorClass=SkippedMigration error="[^"]+" - migrations were skipped$/,
      ),
    );
  });
});

describe('readJournalMigrations', () => {
  let migrationsFolder: string;

  beforeEach(() => {
    migrationsFolder = mkdtempSync(join(tmpdir(), 'migration-ledger-verification-'));
    mkdirSync(join(migrationsFolder, 'meta'));
  });

  afterEach(() => {
    rmSync(migrationsFolder, { recursive: true, force: true });
  });

  it('pairs each journal tag with the hash and timestamp Drizzle records', () => {
    const entries = [
      { idx: 0, version: '7', when: 200, tag: '0000_first', breakpoints: true },
      { idx: 1, version: '7', when: 100, tag: '0001_second', breakpoints: true },
    ];
    writeFileSync(join(migrationsFolder, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'postgresql', entries }));
    writeFileSync(join(migrationsFolder, '0000_first.sql'), 'CREATE TABLE a (id int);');
    writeFileSync(join(migrationsFolder, '0001_second.sql'), 'CREATE TABLE b (id int);');

    const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
    expect(readJournalMigrations(migrationsFolder)).toEqual([
      { tag: '0000_first', hash: sha256('CREATE TABLE a (id int);'), folderMillis: 200 },
      { tag: '0001_second', hash: sha256('CREATE TABLE b (id int);'), folderMillis: 100 },
    ]);
  });
});
