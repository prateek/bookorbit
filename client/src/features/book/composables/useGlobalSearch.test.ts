import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookCard, BookQuery, BooksPage, SeriesPage, SeriesSummary } from '@bookorbit/types'

type ApiResponse = {
  ok: boolean
  status?: number
  json: () => Promise<BooksPage | SeriesPage>
}

const apiMock = vi.fn<(url: string, init?: RequestInit) => Promise<ApiResponse>>()

vi.mock('@/lib/api', () => ({
  api: (url: string, init?: RequestInit) => apiMock(url, init),
}))

import { useGlobalSearch } from './useGlobalSearch'

function makeBook(id: number): BookCard {
  return {
    id,
    status: 'present',
    coverAspectRatio: '2/3',
    title: `Prey ${id}`,
    authors: ['Author'],
    seriesId: null,
    seriesName: null,
    seriesIndex: null,
    files: [{ id: id * 10, format: 'epub', role: 'primary', sizeBytes: null }],
    publishedDate: null,
    publishedYear: null,
    language: null,
    genres: [],
    tags: [],
    rating: null,
    readingProgress: null,
    readStatus: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    metadataScore: null,
    hasCover: false,
    hasMetadataLocks: false,
    lockedFields: [],
    subtitle: null,
    publisher: null,
    pageCount: null,
    isbn13: null,
    narrators: [],
    customMetadata: [],
  }
}

function pageFor(page: number, total: number, size = 20): BooksPage {
  const start = page * size
  const count = Math.max(0, Math.min(size, total - start))
  return {
    items: Array.from({ length: count }, (_, i) => makeBook(start + i + 1)),
    total,
    page,
    size,
  }
}

function makeSeries(id: number, name: string): SeriesSummary {
  return {
    id,
    name,
    bookCount: 1700,
    readCount: 0,
    authors: [],
    coverBookIds: [],
    lastAddedAt: null,
    readingCount: 0,
    libraryNames: [],
    expectedBookCount: null,
    volumes: [],
    volumesTruncated: false,
    gaps: [],
    gapCount: 0,
    nextBookId: 12,
    nextIndex: null,
    nextTitle: null,
  }
}

function seriesPage(series: SeriesSummary[]): SeriesPage {
  return {
    items: series,
    total: series.length,
    page: 0,
    size: 5,
    facets: {} as SeriesPage['facets'],
  }
}

const SERIES_URL_PREFIX = '/api/v1/series?'

function bookQueryCalls() {
  return apiMock.mock.calls.filter(([url]) => url === '/api/v1/books/query')
}

function requestedBodies(): BookQuery[] {
  return bookQueryCalls().map(([, init]) => JSON.parse(String(init?.body)) as BookQuery)
}

function mockApi(bookPage: (body: BookQuery) => BooksPage, series: SeriesSummary[] = []) {
  apiMock.mockImplementation((url, init) => {
    if (url.startsWith(SERIES_URL_PREFIX)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(seriesPage(series)) })
    }
    const body = JSON.parse(String(init?.body)) as BookQuery
    return Promise.resolve({ ok: true, json: () => Promise.resolve(bookPage(body)) })
  })
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('useGlobalSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    apiMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the first page by relevance through the book query endpoint after the debounce', async () => {
    mockApi(() => pageFor(0, 45))
    const query = ref('')
    const search = useGlobalSearch(query)

    query.value = '  Prey  '
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    expect(bookQueryCalls()).toHaveLength(1)
    expect(requestedBodies()[0]).toEqual({
      q: 'Prey',
      sort: [{ field: 'relevance', dir: 'desc' }],
      pagination: { page: 0, size: 20 },
    })
    expect(search.results.value).toHaveLength(20)
    expect(search.total.value).toBe(45)
    expect(search.hasMore.value).toBe(true)
    expect(search.loading.value).toBe(false)
    expect(search.settled.value).toBe(true)
  })

  it('appends the next page when loading more results', async () => {
    mockApi((body) => pageFor(body.pagination.page, 45))
    const query = ref('')
    const search = useGlobalSearch(query)

    query.value = 'Prey'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    await flush()
    await search.loadMore()
    await flush()

    expect(requestedBodies().map((body) => body.pagination.page)).toEqual([0, 1])
    expect(search.results.value).toHaveLength(40)
    expect(search.results.value[0]?.id).toBe(1)
    expect(search.results.value[39]?.id).toBe(40)
    expect(search.total.value).toBe(45)
    expect(search.hasMore.value).toBe(true)
  })

  it('loads matching series alongside the first page and clears them with the query', async () => {
    mockApi(() => pageFor(0, 3), [makeSeries(7, 'Chrysalis'), makeSeries(8, 'Chrysalis Redux')])
    const query = ref('')
    const search = useGlobalSearch(query)

    query.value = 'chrysalis 18'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    const searchCall = apiMock.mock.calls.find(([url]) => url.startsWith(SERIES_URL_PREFIX))
    expect(searchCall?.[0]).toBe('/api/v1/series?q=chrysalis+18&page=0&size=5&sort=relevance&order=desc')
    expect(searchCall?.[1]?.signal).toBeInstanceOf(AbortSignal)
    expect(apiMock.mock.calls.some(([url]) => url.startsWith('/api/v1/search'))).toBe(false)
    expect(search.series.value.map((item) => item.id)).toEqual([7, 8])
    expect(search.seriesTotal.value).toBe(2)

    await search.loadMore()
    expect(apiMock.mock.calls.filter(([url]) => url.startsWith(SERIES_URL_PREFIX))).toHaveLength(1)

    search.clear()
    expect(search.series.value).toEqual([])
    expect(search.seriesTotal.value).toBe(0)
  })

  it('holds the first book page until the series arrive so the list does not shift under the finger', async () => {
    let releaseSeries: () => void = () => {}
    apiMock.mockImplementation((url, init) => {
      if (url.startsWith(SERIES_URL_PREFIX)) {
        return new Promise((resolve) => {
          releaseSeries = () => resolve({ ok: true, json: () => Promise.resolve(seriesPage([makeSeries(7, 'Chrysalis')])) })
        })
      }
      const body = JSON.parse(String(init?.body)) as BookQuery
      return Promise.resolve({ ok: true, json: () => Promise.resolve(pageFor(body.pagination.page, 3)) })
    })
    const query = ref('')
    const search = useGlobalSearch(query)

    query.value = 'chrysalis'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    expect(search.results.value).toEqual([])
    expect(search.loading.value).toBe(true)

    releaseSeries()
    await flush()
    await flush()

    expect(search.series.value.map((item) => item.id)).toEqual([7])
    expect(search.results.value).toHaveLength(3)
    expect(search.loading.value).toBe(false)
  })

  it('shows the books after a capped wait when the series lookup is slow, then adds the series', async () => {
    let releaseSeries: () => void = () => {}
    apiMock.mockImplementation((url, init) => {
      if (url.startsWith(SERIES_URL_PREFIX)) {
        return new Promise((resolve) => {
          releaseSeries = () => resolve({ ok: true, json: () => Promise.resolve(seriesPage([makeSeries(7, 'Chrysalis')])) })
        })
      }
      const body = JSON.parse(String(init?.body)) as BookQuery
      return Promise.resolve({ ok: true, json: () => Promise.resolve(pageFor(body.pagination.page, 3)) })
    })
    const query = ref('')
    const search = useGlobalSearch(query)

    query.value = 'chrysalis'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    await flush()
    expect(search.results.value).toEqual([])

    await vi.advanceTimersByTimeAsync(800)
    await flush()

    expect(search.results.value).toHaveLength(3)
    expect(search.loading.value).toBe(false)
    expect(search.series.value).toEqual([])

    releaseSeries()
    await flush()
    await flush()

    expect(search.series.value.map((item) => item.id)).toEqual([7])
  })

  it('cancels the pending debounce and requests when its scope is disposed', async () => {
    mockApi(() => pageFor(0, 3))
    const query = ref('')
    const scope = effectScope()
    scope.run(() => useGlobalSearch(query))

    query.value = 'chrysalis'
    await nextTick()
    scope.stop()
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    expect(apiMock).not.toHaveBeenCalled()
  })

  it('aborts in-flight requests when its scope is disposed', async () => {
    const signals: AbortSignal[] = []
    apiMock.mockImplementation((_url, init) => {
      if (init?.signal) signals.push(init.signal)
      return new Promise(() => {})
    })
    const query = ref('')
    const scope = effectScope()
    scope.run(() => useGlobalSearch(query))

    query.value = 'chrysalis'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    await flush()
    scope.stop()

    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })
})
