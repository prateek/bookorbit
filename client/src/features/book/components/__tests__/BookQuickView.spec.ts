import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { BookDetail } from '@bookorbit/types'
import BookQuickView from '../BookQuickView.vue'

const displaySettings = {
  bookCoverDisplayMode: ref('blurred-fit'),
}

const permissionState = {
  canDelete: true,
  canEditMetadata: true,
}

const fetchMock = vi.fn<(bookId: number) => void>()
const pushMock = vi.fn<(...args: unknown[]) => unknown>()

const detailRef = ref<BookDetail | null>(null)
const loadingRef = ref(false)
const apiMock = vi.hoisted(() => vi.fn<(input: string) => Promise<Response>>())
const compactRef = ref(false)

vi.mock('@/lib/api', () => ({ api: apiMock }))

vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useMediaQuery: () => compactRef,
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
    }),
  }
})

vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (name: string) => {
      if (name === 'library_delete_books') return permissionState.canDelete
      if (name === 'library_edit_metadata') return permissionState.canEditMetadata
      return true
    },
  }),
}))

vi.mock('@/features/book/composables/useBookDetail', () => ({
  useBookDetail: () => ({
    detail: detailRef,
    loading: loadingRef,
    fetch: fetchMock,
  }),
}))

vi.mock('@/features/book/composables/useCoverVersions', () => ({
  useCoverVersions: () => ({
    coverUrl: () => '/cover.jpg',
  }),
}))

vi.mock('@/features/book/composables/useSafeHtml', () => ({
  useSafeHtml: () => '',
}))

vi.mock('@/composables/useDisplaySettings', () => ({
  useDisplaySettings: () => displaySettings,
}))

function makeDetail(overrides: Partial<BookDetail> = {}): BookDetail {
  return {
    id: 42,
    libraryId: 1,
    libraryName: 'Library',
    status: 'present',
    folderPath: '/books',
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    title: 'Quick View Book',
    subtitle: null,
    description: null,
    isbn10: null,
    isbn13: null,
    publisher: null,
    publishedDate: null,
    publishedYear: null,
    language: null,
    pageCount: null,
    seriesName: null,
    seriesIndex: null,
    rating: null,
    personalNote: null,
    personalNoteUpdatedAt: null,
    communityRatings: [],
    coverSource: null,
    hardcoverEditionId: null,
    providerIds: {},
    authors: [],
    genres: [],
    tags: [],
    files: [
      {
        id: 11,
        role: 'primary',
        format: 'EPUB',
        filename: 'book.epub',
        sizeBytes: 1024,
        absolutePath: '/books/book.epub',
        createdAt: '2026-01-01T00:00:00.000Z',
        durationSeconds: null,
      },
    ],
    lastWrittenAt: null,
    metadataScore: null,
    readStatus: null,
    audioMetadata: null,
    readAloudSync: {
      mode: 'auto',
      state: 'unavailable',
      unavailableReason: 'no_media_overlay_epub',
      overlayFileId: null,
      audioDurationSeconds: null,
      overlayDurationSeconds: null,
      durationDifferenceSeconds: null,
      durationDifferenceRatio: null,
      koreaderDownloadAvailable: false,
    },
    formatPriority: [],
    comicMetadata: null,
    customMetadata: [],
    lockedFields: [],
    collections: [],
    ...overrides,
  }
}

const globalStubs = {
  stubs: {
    Sheet: { template: '<div><slot /></div>' },
    SheetContent: { props: ['side'], template: '<div :data-side="side"><slot /></div>' },
    SheetTitle: { template: '<div><slot /></div>' },
    SheetDescription: { template: '<div><slot /></div>' },
    TooltipProvider: { template: '<div><slot /></div>' },
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
    DialogRoot: { template: '<div><slot /></div>' },
    DialogPortal: { template: '<div><slot /></div>' },
    DialogOverlay: { template: '<div />' },
    DialogContent: { template: '<div><slot /></div>' },
    DialogTitle: { template: '<div><slot /></div>' },
    DialogDescription: { template: '<div><slot /></div>' },
    DialogClose: { template: '<button><slot /></button>' },
    BookCoverPlaceholder: { template: '<div />' },
    Skeleton: { template: '<div />' },
  },
}

describe('BookQuickView', () => {
  beforeEach(() => {
    permissionState.canDelete = true
    permissionState.canEditMetadata = true
    fetchMock.mockReset()
    pushMock.mockReset()
    loadingRef.value = false
    displaySettings.bookCoverDisplayMode.value = 'blurred-fit'
    detailRef.value = makeDetail()
    compactRef.value = false
    apiMock.mockReset()
    apiMock.mockResolvedValue({ ok: true, json: async () => [] } as unknown as Response)
  })

  it('fetches detail when mounted with a book id', () => {
    mount(BookQuickView, {
      props: {
        open: true,
        bookId: 42,
      },
      global: globalStubs,
    })

    expect(fetchMock).toHaveBeenCalledWith(42)
  })

  it('emits close and add-to-collection action from the add button', async () => {
    const wrapper = mount(BookQuickView, {
      props: {
        open: true,
        bookId: 42,
      },
      global: globalStubs,
    })

    await wrapper.get('[data-testid="quick-view-action-add-to-collection"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
    expect(wrapper.emitted('action')).toEqual([['add-to-collection']])
  })

  it('emits close and delete action from the delete button', async () => {
    const wrapper = mount(BookQuickView, {
      props: {
        open: true,
        bookId: 42,
      },
      global: globalStubs,
    })

    await wrapper.get('[data-testid="quick-view-action-more"]').trigger('click')
    await wrapper.get('[data-testid="quick-view-action-delete"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
    expect(wrapper.emitted('action')).toEqual([['delete']])
  })

  it('hides delete action when delete permission is missing', async () => {
    permissionState.canDelete = false

    const wrapper = mount(BookQuickView, {
      props: {
        open: true,
        bookId: 42,
      },
      global: globalStubs,
    })

    await wrapper.get('[data-testid="quick-view-action-more"]').trigger('click')
    expect(wrapper.find('[data-testid="quick-view-action-delete"]').exists()).toBe(false)
  })

  it('keeps delete out of sight until the reader opens More', () => {
    const wrapper = mount(BookQuickView, { props: { open: true, bookId: 42 }, global: globalStubs })

    expect(wrapper.find('[data-testid="quick-view-action-delete"]').exists()).toBe(false)
  })

  it('opens as a bottom sheet on phones and a side drawer otherwise', async () => {
    const wrapper = mount(BookQuickView, { props: { open: true, bookId: 42 }, global: globalStubs })
    expect(wrapper.get('[data-testid="quick-view-sheet"]').attributes('data-side')).toBe('right')

    compactRef.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="quick-view-sheet"]').attributes('data-side')).toBe('bottom')
  })

  it('shows the chapter number and how far the reader has got', async () => {
    detailRef.value = makeDetail({ seriesName: 'Runebound', seriesIndex: '1003' })
    apiMock.mockResolvedValue({ ok: true, json: async () => [{ fileId: 11, percentage: 93.26 }] } as unknown as Response)

    const wrapper = mount(BookQuickView, { props: { open: true, bookId: 42 }, global: globalStubs })
    await flushPromises()

    expect(apiMock).toHaveBeenCalledWith('/api/v1/books/42/progress')
    expect(wrapper.get('[data-testid="quick-view-reading-line"]').text()).toBe('#1003 · 93% read')
    expect(wrapper.get('[data-testid="quick-view-action-read"]').text()).toBe('Resume · 93%')
  })

  it('says a book is unread when there is no progress', async () => {
    const wrapper = mount(BookQuickView, { props: { open: true, bookId: 42 }, global: globalStubs })
    await flushPromises()

    expect(wrapper.get('[data-testid="quick-view-reading-line"]').text()).toBe('Unread')
    expect(wrapper.get('[data-testid="quick-view-action-read"]').text()).toBe('Read')
  })

  it('renders RanobeDB provider icon link', () => {
    detailRef.value = makeDetail({
      providerIds: {
        ranobedb: '1287',
      },
    })

    const wrapper = mount(BookQuickView, {
      props: {
        open: true,
        bookId: 42,
      },
      global: globalStubs,
    })

    const ranobedbLink = wrapper.find('a[title="Open in RanobeDB"]')
    expect(ranobedbLink.exists()).toBe(true)
    expect(ranobedbLink.attributes('href')).toBe('https://ranobedb.org/book/1287')
    expect(ranobedbLink.find('img[alt="RanobeDB"][src="/assets/provider-icons/ranobedb.svg"]').exists()).toBe(true)
  })

  it('renders a direct ComicVine issue link with the monogram fallback', () => {
    detailRef.value = makeDetail({ providerIds: { comicvine: '1126983' } })

    const wrapper = mount(BookQuickView, {
      props: { open: true, bookId: 42 },
      global: globalStubs,
    })

    const comicVineLink = wrapper.find('a[title="Open in ComicVine"]')
    expect(comicVineLink.exists()).toBe(true)
    expect(comicVineLink.attributes()).toMatchObject({
      href: 'https://comicvine.gamespot.com/issue/4000-1126983/',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    expect(comicVineLink.find('img').exists()).toBe(false)
    expect(comicVineLink.text()).toBe('CV')
  })

  it('renders Libro.fm provider icon link', () => {
    detailRef.value = makeDetail({ providerIds: { librofm: '9781234567890' } })

    const wrapper = mount(BookQuickView, {
      props: { open: true, bookId: 42 },
      global: globalStubs,
    })

    const libroFmLink = wrapper.find('a[title="Open in Libro.fm"]')
    expect(libroFmLink.exists()).toBe(true)
    expect(libroFmLink.attributes('href')).toBe('https://libro.fm/audiobooks/9781234567890')
    expect(libroFmLink.find('img[alt="Libro.fm"][src="/assets/provider-icons/librofm.svg"]').exists()).toBe(true)
  })

  it('shrinks natural-bottom quick-view cover to the loaded cover ratio', async () => {
    displaySettings.bookCoverDisplayMode.value = 'natural-bottom'
    detailRef.value = makeDetail({ coverSource: 'extracted' })

    const wrapper = mount(BookQuickView, {
      props: {
        open: true,
        bookId: 42,
      },
      global: globalStubs,
    })
    const image = wrapper.get('img[alt="Quick View Book"]')
    Object.defineProperty(image.element, 'naturalWidth', { configurable: true, value: 1200 })
    Object.defineProperty(image.element, 'naturalHeight', { configurable: true, value: 600 })

    await image.trigger('load')

    const surface = wrapper.get('.book-cover-surface')
    expect(surface.attributes('style')).toContain('aspect-ratio: 2 / 1')
  })
})
