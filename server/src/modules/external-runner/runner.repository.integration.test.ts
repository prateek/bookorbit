import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import { RunnerRepository } from './runner.repository';

const databaseUrl = process.env.RUNNER_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('runner persistence (requires migrated RUNNER_TEST_DATABASE_URL)', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const db = drizzle(pool, { schema });
  let repo: RunnerRepository;
  let owner: number;
  let other: number;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ providers: [RunnerRepository, { provide: DB, useValue: db }] }).compile();
    repo = module.get(RunnerRepository);
    const created = await db
      .insert(schema.users)
      .values(['owner', 'other'].map((label) => ({ username: `runner-${label}-${randomUUID()}`, name: label, passwordHash: 'not-a-login' })))
      .returning();
    owner = created[0].id;
    other = created[1].id;
  });
  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.id, owner));
    await db.delete(schema.users).where(eq(schema.users.id, other));
    await pool.end();
  });
  it('persists owner-scoped connections and bounds pages', async () => {
    await db
      .insert(schema.externalRunners)
      .values(
        Array.from({ length: 102 }, (_, i) => ({ userId: owner, name: `Runner ${i}`, baseUrl: 'https://runner.test', encryptedToken: 'ciphertext' })),
      );
    const stranger = await repo.create({ userId: other, name: 'Private', baseUrl: 'https://other.test', encryptedToken: 'ciphertext' });
    const first = await repo.list(owner);
    expect(first).toHaveLength(101);
    expect(first.every((row) => row.userId === owner)).toBe(true);
    const next = await repo.list(owner, first[99].id);
    expect(next).toHaveLength(2);
    expect((await repo.list(other)).map((row) => row.id)).toEqual([stranger.id]);
  });
  it('refuses cross-owner mutation at the repository boundary', async () => {
    const row = (await repo.list(owner))[0];
    expect(await repo.update(row.id, other, { name: 'Stolen' })).toBeUndefined();
    await repo.remove(row.id, other);
    expect((await repo.find(row.id))?.name).toBe(row.name);
    await repo.update(row.id, owner, { name: 'Updated' });
    expect((await repo.find(row.id))?.name).toBe('Updated');
  });
});
