import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { BookCard, SeriesBooksPage } from '@bookorbit/types'

vi.mock('@/features/series/api/series', () => ({
  fetchSeriesBooks: vi.fn<typeof import('@/features/series/api/series').fetchSeriesBooks>(),
}))

import { fetchSeriesBooks } from '@/features/series/api/series'
import { SERIES_CHAPTERS_PAGE_SIZE, useSeriesChapters } from '../useSeriesChapters'

const mockFetch = vi.mocked(fetchSeriesBooks)

function book(id: number): BookCard {
  return { id, title: `Chapter ${id}`, seriesIndex: id, files: [] } as unknown as BookCard
}

function pageOf(page: number, ids: number[], total: number): SeriesBooksPage {
  return { items: ids.map(book), total, page, size: SERIES_CHAPTERS_PAGE_SIZE, seriesInfo: { name: 'Serial' } } as SeriesBooksPage
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useSeriesChapters', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('opens on the page that holds the current chapter, in series order', async () => {
    mockFetch.mockResolvedValueOnce(pageOf(3, [151, 152, 153], 400))
    const chapters = useSeriesChapters(7, 152)

    await chapters.load()

    expect(mockFetch).toHaveBeenCalledWith(7, { page: 0, size: 50, sort: 'seriesIndex', order: 'asc', anchorBookId: 152 })
    expect(chapters.items.value.map((b) => b.id)).toEqual([151, 152, 153])
    expect(chapters.seriesName.value).toBe('Serial')
    expect(chapters.hasEarlier.value).toBe(true)
    expect(chapters.hasLater.value).toBe(true)
  })

  it('has nothing earlier on the first page and nothing later once the total is covered', async () => {
    mockFetch.mockResolvedValueOnce(pageOf(0, [1, 2, 3], 3))
    const chapters = useSeriesChapters(7, 2)

    await chapters.load()

    expect(chapters.hasEarlier.value).toBe(false)
    expect(chapters.hasLater.value).toBe(false)
  })

  it('prepends the page before the run and appends the page after it, without repeating a chapter', async () => {
    mockFetch.mockResolvedValueOnce(pageOf(2, [101, 102], 200))
    const chapters = useSeriesChapters(7, 101)
    await chapters.load()

    mockFetch.mockResolvedValueOnce(pageOf(1, [99, 100, 101], 200))
    await chapters.loadEarlier()
    mockFetch.mockResolvedValueOnce(pageOf(3, [102, 151], 200))
    await chapters.loadLater()

    expect(mockFetch).toHaveBeenNthCalledWith(2, 7, { page: 1, size: 50, sort: 'seriesIndex', order: 'asc' })
    expect(mockFetch).toHaveBeenNthCalledWith(3, 7, { page: 3, size: 50, sort: 'seriesIndex', order: 'asc' })
    expect(chapters.items.value.map((b) => b.id)).toEqual([99, 100, 101, 102, 151])
    expect(chapters.hasLater.value).toBe(false)

    mockFetch.mockResolvedValueOnce(pageOf(0, [1, 2], 200))
    await chapters.loadEarlier()
    expect(chapters.hasEarlier.value).toBe(false)
  })

  it('drops an earlier page that lands after the listing was reloaded', async () => {
    mockFetch.mockResolvedValueOnce(pageOf(2, [101], 200))
    const chapters = useSeriesChapters(7, 101)
    await chapters.load()

    const earlier = deferred<SeriesBooksPage>()
    mockFetch.mockReturnValueOnce(earlier.promise)
    const pendingEarlier = chapters.loadEarlier()

    mockFetch.mockResolvedValueOnce(pageOf(2, [101, 102], 200))
    await chapters.load()
    earlier.resolve(pageOf(1, [50], 200))
    await pendingEarlier

    expect(chapters.items.value.map((b) => b.id)).toEqual([101, 102])
    expect(chapters.hasEarlier.value).toBe(true)
    expect(chapters.loadingEarlier.value).toBe(false)
  })

  it('asks for one later page at a time', async () => {
    mockFetch.mockResolvedValueOnce(pageOf(0, [1], 200))
    const chapters = useSeriesChapters(7, 1)
    await chapters.load()

    const later = deferred<SeriesBooksPage>()
    mockFetch.mockReturnValueOnce(later.promise)
    const first = chapters.loadLater()
    await chapters.loadLater()
    later.resolve(pageOf(1, [51], 200))
    await first

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(chapters.items.value.map((b) => b.id)).toEqual([1, 51])
  })

  it('reports a failed first load and keeps a failed later page retryable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    const chapters = useSeriesChapters(7, 1)
    await chapters.load()
    expect(chapters.failed.value).toBe(true)

    mockFetch.mockResolvedValueOnce(pageOf(0, [1], 200))
    await chapters.load()
    expect(chapters.failed.value).toBe(false)

    mockFetch.mockRejectedValueOnce(new Error('offline'))
    await chapters.loadLater()
    expect(chapters.items.value.map((b) => b.id)).toEqual([1])
    expect(chapters.hasLater.value).toBe(true)
    expect(chapters.loadingLater.value).toBe(false)
  })
})
