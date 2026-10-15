import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import type { BookCard, SeriesBooksPage, SeriesDetail } from '@bookorbit/types'
import SeriesDetailView from './SeriesDetailView.vue'

enableAutoUnmount(afterEach)

type ListingQuery = { page: number; size: number; anchorBookId?: number | null }

const LISTING_PAGE_SIZE = 50

const mocks = vi.hoisted(() => ({
  route: null as unknown as { path: string; params: { seriesId: string }; query: Record<string, unknown> },
  fetchSeriesBooks: vi.fn<(seriesId: number, query: ListingQuery) => Promise<SeriesBooksPage>>(),
  scrolledTo: [] as Array<string | undefined>,
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn<(to: unknown) => Promise<void>>() }),
}))

vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useMediaQuery: () => ref(true),
}))

vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isSuperuser: ref(true), isDemoRestrictedAccount: ref(false) }),
}))
vi.mock('@/features/book/composables/useBookNavigation', () => ({
  useBookNavigation: () => ({ setBookContext: vi.fn<() => void>(), setBookSlotContext: vi.fn<() => void>() }),
}))
vi.mock('@/features/book/composables/useCoverVersions', () => ({ useCoverVersions: () => ({ coverUrl: () => '' }) }))
vi.mock('@/composables/useDisplaySettings', () => ({
  useDisplaySettings: () => ({
    portraitCoverSize: ref(160),
    gridGap: ref(16),
    cardInfoMode: ref('below-cover'),
    gridCardPrimaryLabel: ref('book-title'),
    gridCardSecondaryLabel: ref('hidden'),
  }),
}))
vi.mock('@/features/library/composables/useLibraries', () => ({
  useLibraries: () => ({ libraries: ref([]), fetchLibraries: () => Promise.resolve() }),
}))
vi.mock('@/composables/usePageTitle', () => ({ usePageTitle: () => undefined }))
vi.mock('@/features/book/composables/useSafeHtml', () => ({ useSafeHtml: () => ref('') }))
vi.mock('@/lib/api', () => ({ api: () => Promise.resolve({ ok: false }) }))
vi.mock('../api/series', () => ({
  fetchSeriesBooks: (seriesId: number, query: ListingQuery) => mocks.fetchSeriesBooks(seriesId, query),
  markSeriesRead: vi.fn<() => Promise<unknown>>(),
  setSeriesFollowing: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('../composables/useSeriesFollowChanges', () => ({ notifySeriesFollowChanged: () => undefined }))

const seriesInfo: SeriesDetail = {
  id: 42,
  name: 'The Serial',
  bookCount: 400,
  readCount: 0,
  authors: [],
  possibleGaps: [],
  expectedBookCount: null,
  readingCount: 0,
  next: null,
  following: true,
}

function chapter(id: number): BookCard {
  return {
    id,
    title: `Chapter ${id}`,
    seriesIndex: String(id),
    files: [],
    genres: [],
    readStatus: null,
    readingProgress: null,
  } as unknown as BookCard
}

/** A serial of `total` chapters numbered from 1, answering anchored queries like the server does. */
function serveSeries(total: number) {
  mocks.fetchSeriesBooks.mockImplementation((_seriesId, query) => {
    const page = query.anchorBookId != null ? Math.floor((query.anchorBookId - 1) / query.size) : query.page
    const start = page * query.size
    const count = Math.max(0, Math.min(query.size, total - start))
    const items = Array.from({ length: count }, (_, index) => chapter(start + index + 1))
    return Promise.resolve({ items, total, page, size: query.size, seriesInfo: { ...seriesInfo, bookCount: total } })
  })
}

/** Listing requests in order; infinite scroll appends pages after the ones that start the run. */
function listingQueries(): ListingQuery[] {
  return mocks.fetchSeriesBooks.mock.calls.map(([, query]) => query).filter((query) => query.size === LISTING_PAGE_SIZE)
}

function firstRowId(wrapper: ReturnType<typeof mountView>): string | undefined {
  return wrapper.find('[data-testid="series-chapter-row"]').attributes('data-book-id')
}

function visit({ book, returning }: { book?: number; returning: boolean }) {
  mocks.route.query = book != null ? { book: String(book) } : {}
  window.history.replaceState({ position: 3, back: '/series', forward: returning ? '/read/301/1' : null }, '')
  mocks.fetchSeriesBooks.mockClear()
  mocks.scrolledTo = []
}

function mountView() {
  return mount(SeriesDetailView, {
    global: {
      stubs: {
        VirtualBookGrid: true,
        AddToCollectionSheet: true,
        BookCoverArtwork: true,
        BookQuickView: true,
        EntityNotFound: true,
        SeriesCompletionBar: true,
        SeriesGapBanner: true,
        ConfirmDialog: true,
      },
    },
  })
}

describe('SeriesDetailView coming back to a history entry', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mocks.route = reactive({ path: '/series/42', params: { seriesId: '42' }, query: {} })
    serveSeries(400)
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      mocks.scrolledTo.push(this.dataset.bookId)
    }
  })

  afterEach(() => {
    window.history.replaceState(null, '')
  })

  it('rebuilds the run the page was left on after loading earlier chapters', async () => {
    visit({ book: 301, returning: false })
    const first = mountView()
    await flushPromises()
    expect(firstRowId(first)).toBe('301')
    await first.get('[data-testid="series-load-earlier"]').trigger('click')
    await flushPromises()
    await first.get('[data-testid="series-load-earlier"]').trigger('click')
    await flushPromises()
    expect(firstRowId(first)).toBe('201')
    first.unmount()

    visit({ book: 301, returning: true })
    const back = mountView()
    await flushPromises()

    expect(listingQueries()[0]).toEqual({ page: 4, size: LISTING_PAGE_SIZE, sort: 'seriesIndex', order: 'asc', libraryId: null, readState: null })
    expect(firstRowId(back)).toBe('201')
    expect(mocks.scrolledTo).toEqual([])
  })

  it('starts from the beginning when the page was left on a run from the start', async () => {
    visit({ book: 301, returning: false })
    const jumped = mountView()
    await flushPromises()
    expect(firstRowId(jumped)).toBe('301')
    jumped.unmount()

    visit({ returning: false })
    const fromStart = mountView()
    await flushPromises()
    fromStart.unmount()

    visit({ book: 301, returning: true })
    const back = mountView()
    await flushPromises()

    expect(listingQueries()[0]).toEqual(expect.objectContaining({ page: 0 }))
    expect(listingQueries()[0]!.anchorBookId).toBeUndefined()
    expect(firstRowId(back)).toBe('1')
  })

  it('falls back to the start when the saved run is past the end of a shorter series', async () => {
    visit({ book: 301, returning: false })
    const first = mountView()
    await flushPromises()
    first.unmount()

    serveSeries(120)
    visit({ book: 301, returning: true })
    const back = mountView()
    await flushPromises()

    expect(listingQueries().slice(0, 2)).toEqual([expect.objectContaining({ page: 6 }), expect.objectContaining({ page: 0 })])
    expect(firstRowId(back)).toBe('1')
    back.unmount()

    visit({ book: 301, returning: true })
    mountView()
    await flushPromises()

    expect(listingQueries()[0]).toEqual(expect.objectContaining({ page: 0 }))
  })

  it('still opens a fresh visit on the chapter and scrolls to it', async () => {
    visit({ book: 301, returning: false })
    const view = mountView()
    await flushPromises()

    expect(listingQueries()[0]).toEqual(expect.objectContaining({ anchorBookId: 301 }))
    expect(mocks.scrolledTo).toEqual(['301'])
    expect(view.find('[aria-current="location"]').attributes('data-book-id')).toBe('301')
  })
})
