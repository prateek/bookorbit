import type { Pool } from 'pg';

import { applyOutOfOrderMigrations, type OrderedMigration } from './migration-out-of-order';

function migration(tag: string, hash: string, folderMillis: number, sql = [`-- ${tag}`]): OrderedMigration {
  return { tag, hash, folderMillis, sql };
}

function createPool(ledger: Array<{ hash: string; created_at: string }> | null, failOn?: string) {
  const clientQuery = vi.fn((text: string) => {
    if (failOn && text === failOn) return Promise.reject(new Error('boom'));
    return Promise.resolve({ rows: [] });
  });
  const release = vi.fn();
  const query = vi.fn((text: string) => {
    if (text.includes('to_regclass')) return Promise.resolve({ rows: [{ exists: ledger !== null }] });
    return Promise.resolve({ rows: ledger ?? [] });
  });
  const connect = vi.fn(() => Promise.resolve({ query: clientQuery, release }));
  return { pool: { query, connect } as unknown as Pick<Pool, 'query' | 'connect'>, clientQuery, release, connect };
}

describe('applyOutOfOrderMigrations', () => {
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    error.mockRestore();
  });

  it('does nothing on a fresh database without a ledger', async () => {
    const { pool, connect } = createPool(null);

    await expect(applyOutOfOrderMigrations(pool, [migration('0000_a', 'a', 1)])).resolves.toEqual([]);
    expect(connect).not.toHaveBeenCalled();
  });

  it('leaves migrations newer than the newest applied one to drizzle', async () => {
    const { pool, connect } = createPool([{ hash: 'a', created_at: '10' }]);

    await expect(applyOutOfOrderMigrations(pool, [migration('0000_a', 'a', 10), migration('0001_b', 'b', 20)])).resolves.toEqual([]);
    expect(connect).not.toHaveBeenCalled();
  });

  it('applies missing migrations stamped at or before the newest applied one, in journal order, in one transaction', async () => {
    const { pool, clientQuery, release } = createPool([
      { hash: 'a', created_at: '10' },
      { hash: 'ours', created_at: '40' },
    ]);
    const migrations = [
      migration('0000_a', 'a', 10),
      migration('0001_upstream', 'up1', 20, ['ALTER TABLE x ADD COLUMN y int', '']),
      migration('0002_upstream', 'up2', 30, ['CREATE INDEX z ON x (y)']),
      migration('0003_ours', 'ours', 40),
      migration('0004_new', 'new', 50),
    ];

    await expect(applyOutOfOrderMigrations(pool, migrations)).resolves.toEqual(['0001_upstream', '0002_upstream']);

    expect(clientQuery.mock.calls.map(([text, params]) => [text, params])).toEqual([
      ['BEGIN', undefined],
      ['ALTER TABLE x ADD COLUMN y int', undefined],
      ['INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)', ['up1', 20]],
      ['CREATE INDEX z ON x (y)', undefined],
      ['INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)', ['up2', 30]],
      ['COMMIT', undefined],
    ]);
    expect(release).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/^\[db\.migrate_out_of_order\] \[end\] count=2 migrations=0001_upstream,0002_upstream durationMs=\d+ - /),
    );
  });

  it('rolls back and rethrows when a statement fails', async () => {
    const { pool, clientQuery, release } = createPool([{ hash: 'ours', created_at: '40' }], 'BROKEN');

    await expect(
      applyOutOfOrderMigrations(pool, [migration('0001_upstream', 'up1', 20, ['BROKEN']), migration('0003_ours', 'ours', 40)]),
    ).rejects.toThrow('boom');

    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(clientQuery).not.toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[db\.migrate_out_of_order\] \[fail\] count=1 migrations=0001_upstream durationMs=\d+ errorClass=Error error="boom" - /,
      ),
    );
  });
});
