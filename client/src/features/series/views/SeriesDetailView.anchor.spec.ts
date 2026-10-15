import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import type { BookCard, SeriesDetail } from '@bookorbit/types'
import SeriesDetailView from './SeriesDetailView.vue'

enableAutoUnmount(afterEach)

const mocks = vi.hoisted(() => ({
  route: null as unknown as { params: { seriesId: string }; query: Record<string, unknown> },
  loadBooks: vi.fn<(input?: unknown) => Promise<void>>(),
  jumpTo: vi.fn<(bookId: number) => Promise<boolean>>(),
  items: null as unknown as { value: BookCard[] },
  scrolledTo: [] as Array<string | undefined>,
  compact: true,
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn<(to: unknown) => Promise<void>>() }),
}))

vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useMediaQuery: () => ref(mocks.compact),
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
  fetchSeriesBooks: () => Promise.resolve({ items: [], total: 0, page: 0, size: 8, seriesInfo: null }),
  markSeriesRead: vi.fn<() => Promise<unknown>>(),
  setSeriesFollowing: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('../composables/useSeriesFollowChanges', () => ({ notifySeriesFollowChanged: () => undefined }))

vi.mock('../composables/useSeriesDetail', () => ({
  useSeriesDetail: () => ({
    seriesInfo: ref<SeriesDetail>({
      id: 42,
      name: 'The Serial',
      bookCount: 3,
      readCount: 0,
      authors: [],
      possibleGaps: [],
      expectedBookCount: null,
      readingCount: 0,
      next: null,
      following: true,
    }),
    items: mocks.items,
    total: ref(mocks.items.value.length),
    loading: ref(false),
    error: ref(null),
    notFound: ref(false),
    hasMore: ref(false),
    hasEarlier: ref(false),
    firstIndex: ref(0),
    loadingEarlier: ref(false),
    sort: ref('seriesIndex'),
    order: ref('asc'),
    libraryId: ref(null),
    readFilter: ref('all'),
    load: mocks.loadBooks,
    jumpTo: mocks.jumpTo,
    loadEarlier: () => Promise.resolve(0),
    refresh: () => Promise.resolve(),
  }),
}))

function chapter(id: number): BookCard {
  return { id, title: `Chapter ${id}`, seriesIndex: String(id), files: [], readStatus: null, readingProgress: null } as unknown as BookCard
}

function mountView({ grid = false } = {}) {
  return mount(SeriesDetailView, {
    global: {
      stubs: {
        ...(grid ? { BookCoverCard: true, CollapsedSeriesCard: true } : { VirtualBookGrid: true }),
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

describe('SeriesDetailView opened on a chapter', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mocks.route = reactive({ params: { seriesId: '42' }, query: {} })
    mocks.items = ref([chapter(54), chapter(55), chapter(56)])
    mocks.loadBooks.mockReset().mockResolvedValue(undefined)
    mocks.jumpTo.mockReset().mockResolvedValue(true)
    mocks.scrolledTo = []
    mocks.compact = true
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      mocks.scrolledTo.push(this.dataset.bookId)
    }
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    window.history.replaceState({ back: '/read/55/1', forward: null }, '')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '')
  })

  it('loads the page holding the chapter, scrolls to its row and marks it', async () => {
    mocks.route.query = { book: '55' }

    const wrapper = mountView()
    await flushPromises()

    expect(mocks.jumpTo).toHaveBeenCalledWith(55)
    expect(mocks.loadBooks).not.toHaveBeenCalled()
    expect(mocks.scrolledTo).toEqual(['55'])
    const marked = wrapper.findAll('[aria-current="location"]')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.attributes('data-book-id')).toBe('55')
  })

  it('scrolls to and marks the chapter in the cover grid on wider screens', async () => {
    mocks.compact = false
    mocks.route.query = { book: '55' }

    const wrapper = mountView({ grid: true })
    await flushPromises()

    expect(wrapper.find('[data-testid="series-chapter-row"]').exists()).toBe(false)
    expect(mocks.jumpTo).toHaveBeenCalledWith(55)
    expect(mocks.scrolledTo).toEqual(['55'])
    const marked = wrapper.findAll('[aria-current="location"]')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.attributes('data-book-id')).toBe('55')
  })

  it('loads from the start without a chapter to land on', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.loadBooks).toHaveBeenCalledWith({ reset: true })
    expect(mocks.jumpTo).not.toHaveBeenCalled()
    expect(wrapper.find('[aria-current="location"]').exists()).toBe(false)
  })

  it('leaves the scroll position to scroll restore when coming back to a page with no saved run', async () => {
    mocks.route.query = { book: '55' }
    window.history.replaceState({ back: '/read/55/1', forward: '/read/60/1' }, '')

    mountView()
    await flushPromises()

    expect(mocks.jumpTo).toHaveBeenCalledWith(55)
    expect(mocks.scrolledTo).toEqual([])
  })

  it('does not scroll when the chapter is not in the listing', async () => {
    mocks.route.query = { book: '999' }
    mocks.jumpTo.mockResolvedValue(false)

    mountView()
    await flushPromises()

    expect(mocks.jumpTo).toHaveBeenCalledWith(999)
    expect(mocks.scrolledTo).toEqual([])
  })
})
