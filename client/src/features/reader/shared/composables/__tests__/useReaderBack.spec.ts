import { afterEach, describe, expect, it, vi } from 'vitest'

const router = vi.hoisted(() => ({ back: vi.fn<() => void>(), replace: vi.fn<(to: unknown) => Promise<void>>() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))

const { resolveReaderBackTarget, useReaderBack } = await import('../useReaderBack')

const membership = (seriesId: number, displayOrder: number) => ({
  seriesId,
  seriesName: `Series ${seriesId}`,
  seriesIndex: null,
  displayOrder,
  expectedBookCount: null,
})

describe('resolveReaderBackTarget', () => {
  it('prefers the primary series page', () => {
    const book = { seriesId: 3, seriesMemberships: [membership(9, 1), membership(5, 0)] }
    expect(resolveReaderBackTarget(1, book)).toEqual({ name: 'series-detail', params: { seriesId: 5 } })
  })

  it('falls back to the book page for a book outside any series', () => {
    expect(resolveReaderBackTarget(1, { seriesId: null, seriesMemberships: [] })).toEqual({ name: 'book-detail', params: { bookId: 1 } })
    expect(resolveReaderBackTarget(1, null)).toEqual({ name: 'book-detail', params: { bookId: 1 } })
  })
})

describe('useReaderBack', () => {
  afterEach(() => {
    window.history.replaceState(null, '')
    vi.clearAllMocks()
  })

  it('goes back when the app has a previous page', () => {
    window.history.replaceState({ back: '/series/5' }, '')
    useReaderBack(1, () => null).goBack()

    expect(router.back).toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('lands on the series page when the reader was opened in a fresh tab', () => {
    window.history.replaceState({ back: null }, '')
    useReaderBack(1, () => ({ seriesId: 5, seriesMemberships: [] })).goBack()

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({ name: 'series-detail', params: { seriesId: 5 } })
  })
})
