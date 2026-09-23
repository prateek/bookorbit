import { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { PushRepository } from './push.repository';

describe('PushRepository.upsertSubscription', () => {
  it('refreshes createdAt when an existing endpoint is re-registered so pruning keeps it', async () => {
    const chain = { values: vi.fn(), onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
    chain.values.mockReturnValue(chain);
    const db = { insert: vi.fn().mockReturnValue(chain) };
    const repo = new PushRepository(db as never);

    await repo.upsertSubscription(7, { endpoint: 'https://web.push.apple.com/abc', p256dh: 'p', auth: 'a', userAgent: 'Safari' });

    const { set } = chain.onConflictDoUpdate.mock.calls[0][0] as { set: Record<string, unknown> };
    expect(set).toMatchObject({ userId: 7, p256dh: 'p', auth: 'a', userAgent: 'Safari' });
    expect(set.createdAt).toBeInstanceOf(SQL);
  });
});
