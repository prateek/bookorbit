import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => vi.fn<(path: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>())

vi.mock('@/lib/api', () => ({ api }))

const { useSeriesNextBook } = await import('../useSeriesNextBook')

describe('useSeriesNextBook unread count', () => {
  beforeEach(() => api.mockReset())

  it('exposes how many unread books follow', async () => {
    api.mockResolvedValue({ ok: true, json: async () => ({ next: null, unreadAfter: 0 }) })
    const { unreadAfter, load } = useSeriesNextBook('epub')

    await load(42, 90)

    expect(unreadAfter.value).toBe(0)
  })

  it('treats a response without the count, or a book outside a series, as unknown', async () => {
    api.mockResolvedValue({ ok: true, json: async () => ({ next: null }) })
    const { unreadAfter, load } = useSeriesNextBook('epub')

    await load(42, 90)
    expect(unreadAfter.value).toBeNull()

    await load(null, 90)
    expect(unreadAfter.value).toBeNull()
  })
})
