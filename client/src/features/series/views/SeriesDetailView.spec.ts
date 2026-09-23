import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, reactive, ref, type PropType } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import type { BookCard, SeriesBooksPage, SeriesDetail } from '@bookorbit/types'
import { APP_RESUMED_EVENT } from '@/components/sidebar/useAppResume'
import SeriesDetailView from './SeriesDetailView.vue'

const GROUP_BY_MEDIA_STORAGE_KEY = 'bookorbit:series-detail:group-by-media'

class MockIntersectionObserver {
  observe = vi.fn<(target: Element) => void>()
  unobserve = vi.fn<(target: Element) => void>()
  disconnect = vi.fn<() => void>()
  takeRecords = vi.fn<() => IntersectionObserverEntry[]>(() => [])
}

enableAutoUnmount(afterEach)

const mocks = vi.hoisted(() => ({
  route: null as unknown as { params: { seriesId: string }; query: Record<string, unknown> },
  routerPush: vi.fn<(to: unknown) => Promise<void>>(),
  fetchLibraries: vi.fn<() => Promise<void>>(),
  setBookContext: vi.fn<(ids: number[], total: number) => void>(),
  setBookSlotContext: vi.fn<(slots: unknown[], total: number) => void>(),
  firstIndex: null as unknown as { value: number },
  loadBooks: vi.fn<(input?: unknown) => Promise<void>>(),
  seriesInfo: null as unknown as { value: SeriesDetail | null },
  items: null as unknown as { value: BookCard[] },
  total: null as unknown as { value: number },
  loading: null as unknown as { value: boolean },
  error: null as unknown as { value: string | null },
  notFound: null as unknown as { value: boolean },
  hasMore: null as unknown as { value: boolean },
  sort: null as unknown as { value: 'seriesIndex' | 'title' | 'addedAt' },
  order: null as unknown as { value: 'asc' | 'desc' },
  libraryId: null as unknown as { value: number | null },
  readFilter: null as unknown as { value: 'all' | 'unread' },
  hasEarlier: null as unknown as { value: boolean },
  loadingEarlier: null as unknown as { value: boolean },
  isCompact: null as unknown as { value: boolean },
  jumpTo: vi.fn<(bookId: number) => Promise<boolean>>(),
  loadEarlier: vi.fn<() => Promise<number>>(),
  refresh: vi.fn<() => Promise<void>>(),
  markSeriesRead: vi.fn<(seriesId: number, params: unknown) => Promise<unknown>>(),
  fetchSeriesBooks: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  api: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => mocks.route,
    useRouter: () => ({ push: mocks.routerPush }),
  }
})

vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isDemoRestrictedAccount: ref(false) }),
}))

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()
  return { ...actual, useMediaQuery: () => mocks.isCompact }
})

vi.mock('@/features/book/composables/useBookNavigation', () => ({
  useBookNavigation: () => ({ setBookContext: mocks.setBookContext, setBookSlotContext: mocks.setBookSlotContext }),
}))

vi.mock('@/features/book/composables/useCoverVersions', () => ({
  useCoverVersions: () => ({ coverUrl: (bookId: number) => `/covers/${bookId}` }),
}))

vi.mock('@/composables/useDisplaySettings', () => ({
  useDisplaySettings: () => ({
    portraitCoverSize: ref(160),
    gridGap: ref(16),
    bookCoverDisplayMode: ref('blurred-fit'),
    gridCardPrimaryLabel: ref('hidden'),
    gridCardSecondaryLabel: ref('hidden'),
  }),
}))

vi.mock('@/features/library/composables/useLibraries', () => ({
  useLibraries: () => ({
    libraries: ref([]),
    fetchLibraries: mocks.fetchLibraries,
  }),
}))

vi.mock('@/composables/usePageTitle', () => ({
  usePageTitle: () => undefined,
}))

vi.mock('@/features/book/composables/useSafeHtml', () => ({
  useSafeHtml: () => ref(''),
}))

vi.mock('../api/series', () => ({
  fetchSeriesBooks: (...args: unknown[]) => mocks.fetchSeriesBooks(...args),
  markSeriesRead: (seriesId: number, params: unknown) => mocks.markSeriesRead(seriesId, params),
}))

vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mocks.api(...args),
}))

vi.mock('../composables/useSeriesDetail', () => ({
  useSeriesDetail: () => ({
    seriesInfo: mocks.seriesInfo,
    items: mocks.items,
    total: mocks.total,
    loading: mocks.loading,
    error: mocks.error,
    notFound: mocks.notFound,
    hasMore: mocks.hasMore,
    hasEarlier: mocks.hasEarlier,
    firstIndex: mocks.firstIndex,
    loadingEarlier: mocks.loadingEarlier,
    sort: mocks.sort,
    order: mocks.order,
    libraryId: mocks.libraryId,
    readFilter: mocks.readFilter,
    load: mocks.loadBooks,
    jumpTo: mocks.jumpTo,
    loadEarlier: mocks.loadEarlier,
    refresh: mocks.refresh,
  }),
}))

function makeBook(overrides: Partial<BookCard> = {}): BookCard {
  return {
    id: 1,
    status: 'present',
    coverAspectRatio: '2/3',
    title: 'Series Book',
    authors: ['Author'],
    seriesId: 42,
    seriesName: 'The Series',
    seriesIndex: '1',
    files: [],
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
    ...overrides,
  }
}

function makeSeriesInfo(overrides: Partial<SeriesDetail> = {}): SeriesDetail {
  return {
    id: 42,
    name: 'The Series',
    bookCount: 1,
    readCount: 0,
    authors: ['Author'],
    possibleGaps: [],
    expectedBookCount: null,
    readingCount: 0,
    next: null,
    ...overrides,
  }
}

const ConfirmDialogStub = defineComponent({
  name: 'ConfirmDialog',
  props: { open: { type: Boolean, required: true }, description: { type: String, default: '' } },
  emits: ['confirm', 'cancel'],
  template: `
    <div v-if="open" data-testid="confirm-dialog" :data-description="description">
      <button data-testid="confirm-dialog-confirm" @click="$emit('confirm')">confirm</button>
    </div>
  `,
})

const VirtualBookGridStub = defineComponent({
  name: 'VirtualBookGrid',
  props: {
    books: {
      type: Array as PropType<BookCard[]>,
      required: true,
    },
  },
  emits: ['action', 'update:book'],
  setup(props) {
    const bookIds = computed(() => props.books.map((book) => book.id).join(','))
    return { bookIds }
  },
  template: `
    <div data-testid="virtual-book-grid" :data-book-ids="bookIds">
      <button v-for="book in books" :key="'add-' + book.id" :data-testid="'grid-add-action-' + book.id" @click="$emit('action', book, 'add-to-collection')">
        add
      </button>
      <button v-for="book in books" :key="'quick-' + book.id" :data-testid="'grid-quick-action-' + book.id" @click="$emit('action', book, 'quick-view')">
        quick
      </button>
    </div>
  `,
})

const BookCoverArtworkStub = defineComponent({
  name: 'BookCoverArtwork',
  props: {
    mode: {
      type: String,
      default: undefined,
    },
    frameAspectRatio: {
      type: String,
      default: undefined,
    },
  },
  emits: ['load', 'error'],
  template: '<div data-testid="lead-cover-artwork" :data-mode="mode ?? \'\'" :data-frame-aspect-ratio="frameAspectRatio ?? \'\'" />',
})

const AddToCollectionSheetStub = defineComponent({
  name: 'AddToCollectionSheet',
  props: {
    open: {
      type: Boolean,
      required: true,
    },
    selectionPayload: {
      type: Object as PropType<{ bookIds?: number[] }>,
      required: true,
    },
  },
  emits: ['update:open'],
  computed: {
    bookIds(): number[] {
      return this.selectionPayload.bookIds ?? []
    },
  },
  template: `
    <div data-testid="collection-sheet" :data-open="open ? 'true' : 'false'" :data-book-ids="bookIds.join(',')">
      <button data-testid="collection-sheet-close" @click="$emit('update:open', false)">close</button>
    </div>
  `,
})

const BookQuickViewStub = defineComponent({
  name: 'BookQuickView',
  props: {
    bookId: {
      type: Number,
      default: null,
    },
    open: {
      type: Boolean,
      required: true,
    },
  },
  emits: ['update:open', 'action'],
  template: `
    <div data-testid="quick-view" :data-open="open ? 'true' : 'false'" :data-book-id="bookId ?? ''">
      <button data-testid="quick-view-action-add" @click="$emit('action', 'add-to-collection')">add</button>
    </div>
  `,
})

function mountView() {
  return mount(SeriesDetailView, {
    global: {
      stubs: {
        VirtualBookGrid: VirtualBookGridStub,
        AddToCollectionSheet: AddToCollectionSheetStub,
        BookCoverArtwork: BookCoverArtworkStub,
        BookQuickView: BookQuickViewStub,
        EntityNotFound: true,
        SeriesCompletionBar: true,
        SeriesGapBanner: true,
        ConfirmDialog: ConfirmDialogStub,
      },
    },
  })
}

describe('SeriesDetailView', () => {
  beforeEach(() => {
    localStorage.clear()

    mocks.route = reactive({
      params: { seriesId: '42' },
      query: {},
    })

    mocks.seriesInfo = ref(makeSeriesInfo())
    mocks.items = ref([makeBook({ id: 7 })])
    mocks.total = ref(1)
    mocks.loading = ref(false)
    mocks.error = ref<string | null>(null)
    mocks.notFound = ref(false)
    mocks.hasMore = ref(false)
    mocks.sort = ref('seriesIndex')
    mocks.order = ref('asc')
    mocks.libraryId = ref<number | null>(null)
    mocks.readFilter = ref('all')
    mocks.hasEarlier = ref(false)
    mocks.firstIndex = ref(0)
    mocks.loadingEarlier = ref(false)
    mocks.isCompact = ref(false)
    mocks.jumpTo.mockReset()
    mocks.jumpTo.mockResolvedValue(true)
    mocks.loadEarlier.mockReset()
    mocks.loadEarlier.mockResolvedValue(0)
    mocks.markSeriesRead.mockReset()
    mocks.markSeriesRead.mockResolvedValue({ updated: 1 })

    mocks.routerPush.mockReset()
    mocks.routerPush.mockResolvedValue(undefined)
    mocks.fetchLibraries.mockReset()
    mocks.fetchLibraries.mockResolvedValue(undefined)
    mocks.setBookContext.mockReset()
    mocks.setBookSlotContext.mockReset()
    mocks.loadBooks.mockReset()
    mocks.loadBooks.mockResolvedValue(undefined)
    mocks.fetchSeriesBooks.mockReset()
    mocks.fetchSeriesBooks.mockResolvedValue({
      items: [makeBook({ id: 7, seriesIndex: '1' })],
      total: 1,
      page: 0,
      size: 8,
      seriesInfo: makeSeriesInfo(),
    })
    mocks.api.mockReset()
    mocks.api.mockResolvedValue({ ok: false })

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders book grids without depending on global view mode', async () => {
    const wrapper = mountView()
    await nextTick()

    expect(wrapper.find('[data-testid="virtual-book-grid"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="virtual-book-grid"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="series-books-section-heading"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="series-media-group-books"]').exists()).toBe(true)
  })

  it('shows the ownership bar only once a provider has supplied a series total', async () => {
    mocks.seriesInfo = ref(makeSeriesInfo({ bookCount: 4, expectedBookCount: 7 }))

    const wrapper = mountView()
    await nextTick()

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('4')
    expect(bar.attributes('aria-valuemax')).toBe('7')
    expect(wrapper.text()).toContain('4 of 7')
  })

  it('hides the ownership bar when no provider total is known', async () => {
    mocks.seriesInfo = ref(makeSeriesInfo({ bookCount: 4, expectedBookCount: null }))

    const wrapper = mountView()
    await nextTick()

    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
  })

  it('shows grouped media sections with labels and counts by default', async () => {
    mocks.items = ref([
      makeBook({ id: 7, files: [{ id: 1, format: 'epub', role: 'primary', sizeBytes: null }] }),
      makeBook({ id: 8, files: [{ id: 2, format: 'pdf', role: 'primary', sizeBytes: null }] }),
      makeBook({ id: 9, files: [{ id: 3, format: 'm4b', role: 'primary', sizeBytes: null }] }),
      makeBook({ id: 10, files: [{ id: 4, format: 'cbz', role: 'primary', sizeBytes: null }] }),
    ])
    mocks.total = ref(4)
    mocks.seriesInfo = ref({ ...makeSeriesInfo(), bookCount: 4 })

    const wrapper = mountView()
    await nextTick()

    const booksGroup = wrapper.get('[data-testid="series-media-group-books"]')
    const audiobooksGroup = wrapper.get('[data-testid="series-media-group-audiobooks"]')
    const comicsGroup = wrapper.get('[data-testid="series-media-group-comics"]')

    expect(wrapper.find('[data-testid="series-books-section-heading"]').exists()).toBe(false)
    expect(booksGroup.text()).toContain('Books')
    expect(booksGroup.text()).toContain('2')
    expect(booksGroup.get('[data-testid="virtual-book-grid"]').attributes('data-book-ids')).toBe('7,8')
    expect(audiobooksGroup.text()).toContain('Audiobooks')
    expect(audiobooksGroup.text()).toContain('1')
    expect(audiobooksGroup.get('[data-testid="virtual-book-grid"]').attributes('data-book-ids')).toBe('9')
    expect(comicsGroup.text()).toContain('Comics')
    expect(comicsGroup.text()).toContain('1')
    expect(comicsGroup.get('[data-testid="virtual-book-grid"]').attributes('data-book-ids')).toBe('10')
  })

  it('switches between grouped and plain grid rendering', async () => {
    mocks.items = ref([
      makeBook({ id: 7, files: [{ id: 1, format: 'epub', role: 'primary', sizeBytes: null }] }),
      makeBook({ id: 8, files: [{ id: 2, format: 'm4b', role: 'primary', sizeBytes: null }] }),
      makeBook({ id: 9, files: [{ id: 3, format: 'cbz', role: 'primary', sizeBytes: null }] }),
    ])
    mocks.total = ref(3)
    mocks.seriesInfo = ref({ ...makeSeriesInfo(), bookCount: 3 })

    const wrapper = mountView()
    await nextTick()

    expect(wrapper.find('[data-testid="series-books-section-heading"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="series-media-group-books"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="virtual-book-grid"]')).toHaveLength(3)

    await wrapper.get('[data-testid="series-group-by-media-toggle"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="series-books-section-heading"]').text()).toBe('Books')
    expect(wrapper.find('[data-testid="series-media-group-books"]').exists()).toBe(false)
    const grids = wrapper.findAll('[data-testid="virtual-book-grid"]')
    expect(grids).toHaveLength(1)
    expect(grids[0]?.attributes('data-book-ids')).toBe('7,8,9')
    expect(localStorage.getItem(GROUP_BY_MEDIA_STORAGE_KEY)).toBe('false')
  })

  it('loads the stored group by media preference', async () => {
    localStorage.setItem(GROUP_BY_MEDIA_STORAGE_KEY, 'false')
    mocks.items = ref([
      makeBook({ id: 7, files: [{ id: 1, format: 'epub', role: 'primary', sizeBytes: null }] }),
      makeBook({ id: 8, files: [{ id: 2, format: 'm4b', role: 'primary', sizeBytes: null }] }),
    ])
    mocks.total = ref(2)
    mocks.seriesInfo = ref({ ...makeSeriesInfo(), bookCount: 2 })

    const wrapper = mountView()
    await nextTick()

    expect(wrapper.get('[data-testid="series-books-section-heading"]').text()).toBe('Books')
    expect(wrapper.find('[data-testid="series-media-group-books"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="series-media-group-audiobooks"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="virtual-book-grid"]')).toHaveLength(1)
  })

  it('opens AddToCollectionSheet with the clicked book id from grid actions', async () => {
    mocks.items = ref([
      makeBook({ id: 7, files: [{ id: 1, format: 'epub', role: 'primary', sizeBytes: null }] }),
      makeBook({ id: 8, files: [{ id: 2, format: 'm4b', role: 'primary', sizeBytes: null }] }),
    ])
    mocks.total = ref(2)
    mocks.seriesInfo = ref({ ...makeSeriesInfo(), bookCount: 2 })

    const wrapper = mountView()
    await nextTick()

    await wrapper.get('[data-testid="grid-add-action-8"]').trigger('click')

    const sheet = wrapper.get('[data-testid="collection-sheet"]')
    expect(sheet.attributes('data-open')).toBe('true')
    expect(sheet.attributes('data-book-ids')).toBe('8')
  })

  it('opens quick-view and closes the collection sheet state', async () => {
    const wrapper = mountView()
    await nextTick()

    await wrapper.get('[data-testid="grid-add-action-7"]').trigger('click')
    await wrapper.get('[data-testid="grid-quick-action-7"]').trigger('click')

    const quickView = wrapper.get('[data-testid="quick-view"]')
    expect(quickView.attributes('data-open')).toBe('true')
    expect(quickView.attributes('data-book-id')).toBe('7')
    const sheet = wrapper.get('[data-testid="collection-sheet"]')
    expect(sheet.attributes('data-open')).toBe('false')
    expect(sheet.attributes('data-book-ids')).toBe('')
  })

  it('clears selected ids when the collection sheet closes', async () => {
    const wrapper = mountView()
    await nextTick()

    await wrapper.get('[data-testid="grid-add-action-7"]').trigger('click')
    await wrapper.get('[data-testid="collection-sheet-close"]').trigger('click')

    const sheet = wrapper.get('[data-testid="collection-sheet"]')
    expect(sheet.attributes('data-open')).toBe('false')
    expect(sheet.attributes('data-book-ids')).toBe('')
  })

  it('scales and centers square lead covers in the series header stack', async () => {
    const lead = makeBook({ id: 7, seriesIndex: '1', hasCover: true })
    mocks.fetchSeriesBooks.mockResolvedValueOnce({
      items: [lead],
      total: 1,
      page: 0,
      size: 8,
      seriesInfo: makeSeriesInfo(),
    })

    const wrapper = mountView()
    await flushPromises()
    await nextTick()

    const artwork = wrapper.getComponent(BookCoverArtworkStub)
    artwork.vm.$emit('load', 1)
    await nextTick()

    const style = wrapper.get('[data-testid="lead-cover-artwork"]').element.parentElement?.getAttribute('style') ?? ''
    expect(style).toContain('scale(1.25)')
    expect(style).toContain('transform-origin: center bottom')
    expect(style).toContain('translateY(-12.5%)')
    expect(style).toContain('aspect-ratio: 1 / 1')
    expect(style).toContain('--lead-cover-hover-translate-y: calc(-12px - 12.5%)')
    expect(style).toContain('--lead-cover-hover-scale: 1.2875')
    expect(wrapper.get('[data-testid="lead-cover-artwork"]').attributes('data-mode')).toBe('natural-bottom')
    expect(wrapper.get('[data-testid="lead-cover-artwork"]').attributes('data-frame-aspect-ratio')).toBe('1/1')

    artwork.vm.$emit('load', 1)
    await nextTick()
    const secondStyle = wrapper.get('[data-testid="lead-cover-artwork"]').element.parentElement?.getAttribute('style') ?? ''
    expect(secondStyle).toBe(style)
  })

  it('ignores stale lead preview responses after route id becomes invalid', async () => {
    let resolveLeadPreview!: (value: SeriesBooksPage) => void
    mocks.fetchSeriesBooks.mockImplementationOnce(
      () =>
        new Promise<SeriesBooksPage>((resolve) => {
          resolveLeadPreview = resolve
        }),
    )

    const wrapper = mountView()
    await nextTick()

    mocks.route.params.seriesId = 'invalid'
    await nextTick()

    resolveLeadPreview({
      items: [makeBook({ id: 7, seriesIndex: '1', hasCover: true })],
      total: 1,
      page: 0,
      size: 8,
      seriesInfo: makeSeriesInfo(),
    })
    await flushPromises()

    expect(mocks.api).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="lead-cover-artwork"]').exists()).toBe(false)
  })

  it('loads all books and navigates to edit metadata, preserving the setBookContext when navigating away', async () => {
    const book1 = makeBook({ id: 101 })
    const book2 = makeBook({ id: 102 })

    mocks.items.value = [book1]
    mocks.total.value = 2
    mocks.hasMore.value = true

    mocks.loadBooks.mockImplementation(async (opts?: unknown) => {
      const reset = opts && typeof opts === 'object' && 'reset' in opts ? Boolean((opts as Record<string, unknown>).reset) : false
      if (reset) {
        mocks.items.value = [book1]
        mocks.hasMore.value = true
        return
      }
      mocks.items.value = [book1, book2]
      mocks.hasMore.value = false
    })

    const wrapper = mountView()
    await nextTick()

    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('Edit Metadata'))
    expect(editBtn).toBeDefined()

    mocks.setBookContext.mockClear()
    mocks.loadBooks.mockClear()

    await editBtn!.trigger('click')
    await flushPromises()

    expect(mocks.loadBooks).toHaveBeenCalled()
    expect(mocks.setBookContext).toHaveBeenCalledWith([101, 102], 2)
    expect(mocks.routerPush).toHaveBeenCalledWith({
      name: 'book-detail',
      params: { bookId: 101 },
      query: { tab: 'edit' },
    })

    mocks.setBookContext.mockClear()
    mocks.loadBooks.mockClear()
    mocks.route.params.seriesId = ''
    await nextTick()

    expect(mocks.loadBooks).not.toHaveBeenCalled()
    expect(mocks.setBookContext).not.toHaveBeenCalled()
  })

  describe('continuing a series', () => {
    const next = { bookId: 55, title: 'Chapter Five', seriesIndex: '5', status: 'unread' as const, fileId: 900, format: 'epub' }

    it('makes continuing the primary action and opens the reader straight on the next chapter', async () => {
      mocks.seriesInfo.value = makeSeriesInfo({ bookCount: 9, readCount: 4, next })

      const wrapper = mountView()
      await nextTick()

      const button = wrapper.get('[data-testid="series-continue"]')
      expect(button.text()).toContain('#5 Chapter Five')
      expect(button.text()).toMatch(/Continue/)

      await button.trigger('click')
      expect(mocks.routerPush).toHaveBeenCalledWith({ name: 'reader', params: { bookId: 55, fileId: 900 }, query: { format: 'epub' } })
    })

    it('offers to start a series nobody has opened, falling back to the book page without a readable file', async () => {
      mocks.seriesInfo.value = makeSeriesInfo({ bookCount: 3, readCount: 0, next: { ...next, fileId: null, format: null } })

      const wrapper = mountView()
      await nextTick()

      const button = wrapper.get('[data-testid="series-continue"]')
      expect(button.text()).toMatch(/Start/)

      await button.trigger('click')
      expect(mocks.routerPush).toHaveBeenCalledWith({ name: 'book-detail', params: { bookId: 55 } })
    })

    it('has no continue action once every book is read', async () => {
      mocks.seriesInfo.value = makeSeriesInfo({ bookCount: 1, readCount: 1, next: null })

      const wrapper = mountView()
      await nextTick()

      expect(wrapper.find('[data-testid="series-continue"]').exists()).toBe(false)
    })

    it('switches to series order before jumping to the next unread chapter', async () => {
      mocks.seriesInfo.value = makeSeriesInfo({ bookCount: 9, readCount: 4, next })
      mocks.sort.value = 'title'

      const wrapper = mountView()
      await nextTick()
      await wrapper.get('[data-testid="series-jump-next"]').trigger('click')
      await flushPromises()

      expect(mocks.sort.value).toBe('seriesIndex')
      expect(mocks.jumpTo).toHaveBeenCalledWith(55)
    })
  })

  describe('on a phone', () => {
    beforeEach(() => {
      mocks.isCompact.value = true
    })

    it('lists chapters as dense rows instead of a cover grid', async () => {
      mocks.items.value = [makeBook({ id: 7, seriesIndex: '1', title: 'One' }), makeBook({ id: 8, seriesIndex: '2', title: 'Two' })]

      const wrapper = mountView()
      await nextTick()

      expect(wrapper.find('[data-testid="virtual-book-grid"]').exists()).toBe(false)
      const rows = wrapper.findAll('[data-testid="series-chapter-row"]')
      expect(rows).toHaveLength(2)
      expect(rows[1]!.text()).toContain('#2')
      expect(rows[1]!.text()).toContain('Two')
    })

    it('opens the reader when a chapter row is tapped', async () => {
      mocks.items.value = [makeBook({ id: 7, seriesIndex: '1', files: [{ id: 70, format: 'epub', role: 'primary', sizeBytes: null }] })]

      const wrapper = mountView()
      await nextTick()
      await wrapper.get('[data-testid="series-chapter-row"] button').trigger('click')

      expect(mocks.routerPush).toHaveBeenCalledWith({ name: 'reader', params: { bookId: 7, fileId: 70 }, query: { format: 'epub' } })
    })

    it('filters to unread chapters from the compact control row', async () => {
      const wrapper = mountView()
      await nextTick()
      await wrapper.get('[data-testid="series-unread-filter"]').trigger('click')

      expect(mocks.readFilter.value).toBe('unread')
    })

    it('confirms before marking every chapter up to a row as read', async () => {
      mocks.libraryId.value = 3
      mocks.items.value = [makeBook({ id: 7, seriesIndex: '12' })]

      const wrapper = mountView()
      await nextTick()
      wrapper.getComponent({ name: 'SeriesChapterList' }).vm.$emit('markReadUpTo', mocks.items.value[0])
      await nextTick()

      const dialog = wrapper.get('[data-testid="confirm-dialog"]')
      expect(dialog.attributes('data-description')).toContain('#12')
      expect(mocks.markSeriesRead).not.toHaveBeenCalled()

      mocks.loadBooks.mockClear()
      await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
      await flushPromises()

      expect(mocks.markSeriesRead).toHaveBeenCalledWith(42, { upToIndex: '12', libraryId: 3 })
      expect(mocks.loadBooks).toHaveBeenCalledWith({ reset: true, keepPreviousData: true })
      expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
    })

    it('keeps true series positions for book navigation after a jump', async () => {
      mocks.items.value = [makeBook({ id: 501, seriesIndex: '501' }), makeBook({ id: 502, seriesIndex: '502' })]
      mocks.total.value = 1700
      mocks.firstIndex.value = 500

      mountView()
      await nextTick()

      const [slots, total] = mocks.setBookSlotContext.mock.lastCall!
      expect(total).toBe(1700)
      expect(slots).toHaveLength(502)
      expect(slots[500]).toMatchObject({ id: 501 })
      expect(slots[0]).toMatchObject({ placeholder: true })
    })
  })

  it('refreshes the loaded chapters in place when the app resumes', async () => {
    mountView()
    await flushPromises()
    mocks.loadBooks.mockClear()

    window.dispatchEvent(new CustomEvent(APP_RESUMED_EVENT))

    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.loadBooks).not.toHaveBeenCalled()
  })
})
