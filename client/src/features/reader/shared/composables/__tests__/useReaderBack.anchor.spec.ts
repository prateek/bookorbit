import { afterEach, describe, expect, it, vi } from 'vitest'

const router = vi.hoisted(() => ({
  back: vi.fn<() => void>(),
  replace: vi.fn<(to: unknown) => Promise<void>>(),
  resolve: vi.fn<(to: string) => { name: string; params: Record<string, string> }>(() => ({ name: 'dashboard', params: {} })),
}))
vi.mock('vue-router', () => ({ useRouter: () => router }))

const { useReaderBack } = await import('../useReaderBack')

const inSeries = () => ({ seriesId: 5, seriesMemberships: [] })

/** Stands in for the router: a handoff `router.replace` merges its `state` into the current entry. */
function handOffTo(state: Record<string, unknown>) {
  window.history.replaceState({ ...(window.history.state as object), ...state }, '')
}

describe('useReaderBack after moving between chapters', () => {
  afterEach(() => {
    window.history.replaceState(null, '')
    vi.clearAllMocks()
  })

  it('goes back to the opening page while the reader is still on the chapter it opened', () => {
    window.history.replaceState({ back: '/series/5' }, '')
    useReaderBack(10, inSeries).goBack()

    expect(router.back).toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it("lands on the current chapter's series row once the reader has moved on from a page outside the series", () => {
    window.history.replaceState({ back: '/' }, '')
    handOffTo(useReaderBack(10, inSeries).handoffState())

    useReaderBack(11, inSeries).goBack()

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({ name: 'series-detail', params: { seriesId: 5 }, query: { book: '11' } })
  })

  it('remembers the starting chapter across several handoffs', () => {
    window.history.replaceState({ back: '/' }, '')
    handOffTo(useReaderBack(10, inSeries).handoffState())
    handOffTo(useReaderBack(11, inSeries).handoffState())

    useReaderBack(12, inSeries).goBack()

    expect(router.replace).toHaveBeenCalledWith({ name: 'series-detail', params: { seriesId: 5 }, query: { book: '12' } })
  })

  it('anchors on the current chapter when a fresh tab has no page to go back to', () => {
    window.history.replaceState({ back: null }, '')
    useReaderBack(10, inSeries).goBack()

    expect(router.replace).toHaveBeenCalledWith({ name: 'series-detail', params: { seriesId: 5 }, query: { book: '10' } })
  })

  it('opens the book page for a chapter outside any series after moving on', () => {
    window.history.replaceState({ back: '/books/10' }, '')
    handOffTo(useReaderBack(10, () => null).handoffState())

    useReaderBack(11, () => null).goBack()

    expect(router.replace).toHaveBeenCalledWith({ name: 'book-detail', params: { bookId: 11 } })
  })
})
