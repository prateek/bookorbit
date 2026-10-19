import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNewArrivals } from './useNewArrivals'

function response(ids: number[], hasMore = false) {
  return new Response(
    JSON.stringify({
      title: 'New chapters',
      message: 'Series: 75 new',
      seriesId: 7,
      items: ids.map((id) => ({ id })),
      offset: 0,
      total: 75,
      hasMore,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('new arrivals pages', () => {
  it('requests a bounded page and replaces it when paging instead of accumulating the batch', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response([1, 2], true))
      .mockResolvedValueOnce(response([51, 52]))
    vi.stubGlobal('fetch', fetch)
    const arrivals = useNewArrivals('batch')
    await arrivals.load()
    expect(arrivals.page.value?.items.map((book) => book.id)).toEqual([1, 2])
    await arrivals.next()
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/push/arrivals/batch?limit=50&offset=50')
    expect(arrivals.page.value?.items.map((book) => book.id)).toEqual([51, 52])
    expect(arrivals.hasPrevious.value).toBe(true)
  })

  it('explains expired or removed notifications and allows transient failures to be retried', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockRejectedValueOnce(new TypeError('Offline'))
      .mockResolvedValueOnce(response([1]))
    vi.stubGlobal('fetch', fetch)
    const arrivals = useNewArrivals('batch')
    await arrivals.load()
    expect(arrivals.error.value).toBe('unavailable')
    await arrivals.retry()
    expect(arrivals.error.value).toBe('failed')
    await arrivals.retry()
    expect(arrivals.error.value).toBeNull()
    expect(arrivals.page.value?.items).toEqual([{ id: 1 }])
  })
})

it('retries the requested next page after it fails', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response([1], true))
    .mockRejectedValueOnce(new TypeError('Offline'))
    .mockResolvedValueOnce(response([51]))
  vi.stubGlobal('fetch', fetch)
  const arrivals = useNewArrivals('batch')
  await arrivals.load()
  await arrivals.next()
  expect(arrivals.error.value).toBe('failed')
  await arrivals.retry()
  expect(fetch.mock.calls[2][0]).toBe('/api/v1/push/arrivals/batch?limit=50&offset=50')
  expect(arrivals.page.value?.items).toEqual([{ id: 51 }])
})
