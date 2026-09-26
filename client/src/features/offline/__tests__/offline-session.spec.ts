import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: vi.fn<() => Promise<Response>>().mockRejectedValue(new TypeError('Failed to fetch')),
  isServerUnreachable: (reason: unknown) => reason instanceof TypeError,
  ServerUnavailableError: class extends Error {},
}))

import { deleteOfflineDb } from '../lib/offline-db'
import { currentOfflineSession, startOfflineSession, stopOfflineSession } from '../offline-session'

afterEach(async () => {
  await stopOfflineSession()
  await Promise.all([deleteOfflineDb(1), deleteOfflineDb(2)])
})

describe('startOfflineSession', () => {
  it('keeps the session of the user who signed in last when two opens overlap', async () => {
    const first = startOfflineSession(1)
    const second = startOfflineSession(2)
    const [a, b] = await Promise.all([first, second])

    expect(a).toBeNull()
    expect(b?.userId).toBe(2)
    expect(currentOfflineSession()?.userId).toBe(2)
  })
})
