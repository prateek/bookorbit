import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import BookListRow from '../BookListRow.vue'
import type { BookCard } from '@bookorbit/types'
import { useDisplaySettings } from '@/composables/useDisplaySettings'

const routerPushMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>())
const toastErrorMock = vi.hoisted(() => vi.fn<(message: string) => void>())

vi.mock('vue-sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn<() => void>(), info: vi.fn<() => void>() } }))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRouter: () => ({ push: routerPushMock }) }
})
vi.mock('@/features/book/composables/useCoverVersions', () => ({
  useCoverVersions: () => ({ coverUrl: (bookId: number) => `/cover-${bookId}.jpg`, bumpVersion: vi.fn<(...args: unknown[]) => void>() }),
}))
const setStatusMock = vi.hoisted(() => vi.fn<(bookId: number, status: string) => Promise<unknown>>())
vi.mock('@/features/book/composables/useBookStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/book/composables/useBookStatus')>()
  return {
    ...actual,
    useBookStatus: () => ({ setStatus: setStatusMock, updateStatus: vi.fn<() => Promise<void>>(), STATUS_OPTIONS: actual.STATUS_OPTIONS }),
  }
})
vi.mock('@/features/book/lib/book-cover', () => ({
  bookCoverStyle: () => ({ background: 'oklch(0.22 0.07 200)', color: 'oklch(0.92 0.03 200)' }),
  bookCoverPalette: () => ({
    gradient: 'linear-gradient(150deg, oklch(0.22 0.07 200) 0%, oklch(0.28 0.05 220) 100%)',
    from: 'oklch(0.22 0.07 200)',
    to: 'oklch(0.28 0.05 220)',
    color: 'oklch(0.99 0.025 200)',
    accent: 'oklch(0.82 0.16 200)',
    textMuted: 'oklch(0.92 0.08 200)',
  }),
}))

const globalStubs = {
  stubs: {
    DropdownMenu: { template: '<div><slot /></div>' },
    DropdownMenuContent: { template: '<div><slot /></div>' },
    DropdownMenuItem: { template: '<div><slot /></div>' },
    DropdownMenuTrigger: { template: '<div><slot /></div>' },
    DropdownMenuSeparator: { template: '<div />' },
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
  },
}

const { bookSpineOverlay, thumbnailClickAction } = useDisplaySettings()

beforeEach(() => {
  routerPushMock.mockClear()
  toastErrorMock.mockClear()
  setStatusMock.mockReset()
  setStatusMock.mockResolvedValue({})
})

afterEach(() => {
  bookSpineOverlay.value = 'off'
  thumbnailClickAction.value = 'reader'
})

const missingBook: BookCard = {
  id: 1,
  status: 'missing',
  coverAspectRatio: '2/3',
  title: 'Gone Book',
  authors: ['Test Author'],
  seriesName: null,
  seriesIndex: null,
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
}

const presentBook: BookCard = {
  id: 2,
  status: 'present',
  coverAspectRatio: '2/3',
  title: 'Available Book',
  authors: ['Test Author'],
  seriesName: null,
  seriesIndex: null,
  files: [{ id: 10, format: 'epub', role: 'primary', sizeBytes: null }],
  publishedDate: null,
  publishedYear: 2024,
  language: 'en',
  genres: ['Fiction'],
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

const collapsedSeriesBook: BookCard = {
  ...presentBook,
  id: 20,
  title: 'Representative Volume',
  authors: ['Series Author'],
  seriesId: 99,
  seriesName: 'The Trilogy',
  seriesIndex: '1',
  readingProgress: 33,
  collapsedSeries: {
    bookCount: 4,
    readCount: 1,
    coverBookIds: [20, 21, 22, 23],
    coverUpdatedAtByBookId: {
      20: '2026-01-01T00:00:00.000Z',
      21: '2026-01-02T00:00:00.000Z',
      22: '2026-01-03T00:00:00.000Z',
      23: '2026-01-04T00:00:00.000Z',
    },
    seriesLatestAddedAt: '2026-01-04T00:00:00.000Z',
    firstVolumeBookId: 20,
    latestVolumeBookId: 23,
    firstUnreadBookId: 21,
  },
}

describe('BookListRow - missing state', () => {
  it('applies grayscale and opacity-60 to the root row', () => {
    const wrapper = mount(BookListRow, { props: { book: missingBook }, global: globalStubs })
    const root = wrapper.find('.flex.items-center')
    expect(root.classes()).toContain('grayscale')
    expect(root.classes()).toContain('opacity-60')
  })

  it('renders the amber missing badge', () => {
    const wrapper = mount(BookListRow, { props: { book: missingBook }, global: globalStubs })
    const badge = wrapper.find('[class*="bg-amber-500"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text().toLowerCase()).toContain('missing')
  })

  it('does not apply hover:bg-muted on the row when missing', () => {
    const wrapper = mount(BookListRow, { props: { book: missingBook }, global: globalStubs })
    const root = wrapper.find('.flex.items-center')
    expect(root.classes().join(' ')).not.toContain('hover:bg-muted')
  })

  it('opens book details for missing books when thumbnail clicks prefer details', async () => {
    thumbnailClickAction.value = 'details'
    const wrapper = mount(BookListRow, { props: { book: missingBook }, global: globalStubs })

    await wrapper.find('.flex.items-center').trigger('click')

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'book-detail', params: { bookId: 1 } })
  })
})

describe('BookListRow - present state', () => {
  it('emits quick-view on row click by default', async () => {
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })

    await wrapper.find('.flex.items-center').trigger('click')

    expect(wrapper.emitted('action')?.[0]).toEqual(['quick-view'])
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('opens book details on row click when thumbnail clicks prefer details', async () => {
    thumbnailClickAction.value = 'details'
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })

    await wrapper.find('.flex.items-center').trigger('click')

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'book-detail', params: { bookId: 2 } })
    expect(wrapper.emitted('action')).toBeUndefined()
  })

  it('selects instead of navigating in selection mode', async () => {
    thumbnailClickAction.value = 'details'
    const wrapper = mount(BookListRow, { props: { book: presentBook, selectionMode: true }, global: globalStubs })

    await wrapper.find('.flex.items-center').trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('keeps the explicit format button opening the reader when thumbnail clicks prefer details', async () => {
    thumbnailClickAction.value = 'details'
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })

    const formatButton = wrapper.findAll('button').find((button) => button.text() === 'epub')
    expect(formatButton).toBeDefined()
    await formatButton!.trigger('click')

    expect(routerPushMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'reader', params: { bookId: 2, fileId: 10 } }))
    expect(routerPushMock).not.toHaveBeenCalledWith({ name: 'book-detail', params: { bookId: 2 } })
  })

  it('does not apply grayscale to the root row', () => {
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })
    const root = wrapper.find('.flex.items-center')
    expect(root.classes()).not.toContain('grayscale')
  })

  it('does not render the missing badge', () => {
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })
    expect(wrapper.find('[class*="bg-amber-500"]').exists()).toBe(false)
  })

  it('marks the EPUB format button for media-overlay read-along files', () => {
    const wrapper = mount(BookListRow, {
      props: {
        book: {
          ...presentBook,
          files: [{ id: 10, format: 'epub', role: 'primary', sizeBytes: null, mediaOverlay: { available: true, durationSeconds: 42 } }],
        },
      },
      global: globalStubs,
    })

    expect(wrapper.text()).toContain('epub')
    expect(wrapper.text()).not.toContain('NARR')
    expect(wrapper.text()).toContain('Open read-along EPUB')
    expect(wrapper.find('.lucide-headphones').exists()).toBe(true)
  })

  it('applies hover:bg-muted/50 when present with a readable file', () => {
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })
    const root = wrapper.find('.flex.items-center')
    expect(root.classes().join(' ')).toContain('hover:bg-muted')
  })

  it('syncs the displayed star rating when the book prop changes externally', async () => {
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })

    expect(wrapper.findAll('.fill-lime-400')).toHaveLength(0)

    await wrapper.setProps({
      book: {
        ...presentBook,
        rating: 4,
      },
    })

    expect(wrapper.findAll('.fill-lime-400')).toHaveLength(4)
  })

  it('forces spine overlay off for audiobook rows even when global spine mode is enabled', () => {
    bookSpineOverlay.value = 'strong'
    const wrapper = mount(BookListRow, {
      props: {
        book: {
          ...presentBook,
          files: [{ id: 22, format: 'm4b', role: 'primary', sizeBytes: null }],
        },
      },
      global: globalStubs,
    })

    const cover = wrapper.find('.book-cover-surface')
    expect(cover.attributes('data-cover-spine')).toBe('off')
  })
})

describe('BookListRow collapsed series', () => {
  it('renders the series summary instead of the representative book title', () => {
    const wrapper = mount(BookListRow, { props: { book: collapsedSeriesBook }, global: globalStubs })
    const row = wrapper.get('[data-testid="collapsed-series-list-row"]')

    expect(row.text()).toContain('The Trilogy')
    expect(row.text()).toContain('4 books')
    expect(row.text()).toContain('1 read')
    expect(row.text()).toContain('Series Author')
    expect(row.text()).not.toContain('Representative Volume')
  })

  it('caps collapsed series cover thumbnails to a bounded set', () => {
    const wrapper = mount(BookListRow, { props: { book: { ...collapsedSeriesBook, hasCover: true } }, global: globalStubs })
    const covers = wrapper.findAll('[data-testid="collapsed-series-cover"]')

    expect(covers).toHaveLength(3)
    expect(wrapper.findAll('img').map((img) => img.attributes('src'))).toEqual(['/cover-20.jpg', '/cover-21.jpg', '/cover-22.jpg'])
  })

  it('draws a generated cover instead of requesting a known-missing representative thumbnail', () => {
    const wrapper = mount(BookListRow, { props: { book: collapsedSeriesBook }, global: globalStubs })

    expect(wrapper.findAll('[data-testid="collapsed-series-cover"]')).toHaveLength(3)
    expect(wrapper.findAll('img').map((img) => img.attributes('src'))).toEqual(['/cover-21.jpg', '/cover-22.jpg'])
  })

  it('swaps a thumbnail that fails to load for the generated cover', async () => {
    const wrapper = mount(BookListRow, { props: { book: { ...collapsedSeriesBook, hasCover: true } }, global: globalStubs })

    await wrapper.findAll('img')[1]!.trigger('error')

    expect(wrapper.findAll('img').map((img) => img.attributes('src'))).toEqual(['/cover-20.jpg', '/cover-22.jpg'])
  })

  it('opens the series detail route on row click', async () => {
    thumbnailClickAction.value = 'details'
    const wrapper = mount(BookListRow, { props: { book: collapsedSeriesBook }, global: globalStubs })

    await wrapper.get('[data-testid="collapsed-series-list-row"]').trigger('click')

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'series-detail', params: { seriesId: 99 } })
    expect(routerPushMock).not.toHaveBeenCalledWith({ name: 'book-detail', params: { bookId: 20 } })
    expect(wrapper.emitted('action')).toBeUndefined()
  })

  it('does not select a representative book or navigate in selection mode', async () => {
    const wrapper = mount(BookListRow, {
      props: { book: collapsedSeriesBook, selectionMode: true },
      global: globalStubs,
    })

    await wrapper.get('[data-testid="collapsed-series-list-row"]').trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(routerPushMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="book-selection-checkbox"]').exists()).toBe(false)
  })

  it('renders a fallback cover when collapsed cover ids are unavailable', () => {
    const wrapper = mount(BookListRow, {
      props: {
        book: {
          ...collapsedSeriesBook,
          collapsedSeries: {
            ...collapsedSeriesBook.collapsedSeries!,
            coverBookIds: [],
          },
        },
      },
      global: globalStubs,
    })

    expect(wrapper.find('[data-testid="collapsed-series-cover-fallback"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="collapsed-series-cover"]')).toHaveLength(0)
  })

  it('uses the normal list cover width and no empty progress bar for a one-book series', () => {
    const wrapper = mount(BookListRow, {
      props: {
        book: {
          ...collapsedSeriesBook,
          collapsedSeries: {
            ...collapsedSeriesBook.collapsedSeries!,
            bookCount: 1,
            readCount: 0,
            coverBookIds: [20],
          },
        },
      },
      global: globalStubs,
    })
    const cover = wrapper.get('[data-testid="collapsed-series-cover"]')

    expect(cover.classes()).toContain('sm:w-16')
    expect(cover.classes()).toContain('w-9')
    expect(cover.classes()).not.toContain('sm:w-12')
    expect(wrapper.get('[data-testid="collapsed-series-list-row"]').text()).toContain('1 book')
    expect(wrapper.find('[data-testid="collapsed-series-progress"]').exists()).toBe(false)
  })
})

function touchPointer(type: string, x = 100, y = 100) {
  return new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
}

async function dispatchTouch(el: Element, type: string, x = 100, y = 100) {
  const event = touchPointer(type, x, y)
  Object.defineProperty(event, 'pointerType', { value: 'touch' })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  el.dispatchEvent(event)
}

describe('BookListRow - phone ergonomics', () => {
  it('shows a compact series and date line and decodes HTML entities in titles', () => {
    const wrapper = mount(BookListRow, {
      props: { book: { ...presentBook, title: 'It&#39;s Hard to Break a Slug&#39;s Back', seriesName: 'Slugs', seriesIndex: '12' } },
      global: globalStubs,
    })

    expect(wrapper.text()).toContain("It's Hard to Break a Slug's Back")
    expect(wrapper.text()).not.toContain('&#39;')
    expect(wrapper.get('[data-testid="book-list-row-compact-meta"]').text()).toBe('Slugs · 2024')
    expect(wrapper.get('[data-testid="book-list-row-series-position"]').text()).toBe('#12')
  })

  it('leaves the series position chip off books outside a series', () => {
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })

    expect(wrapper.find('[data-testid="book-list-row-series-position"]').exists()).toBe(false)
  })

  it('shows the read state on the row', () => {
    const wrapper = mount(BookListRow, {
      props: { book: { ...presentBook, readStatus: { status: 'read' } as BookCard['readStatus'] } },
      global: globalStubs,
    })

    expect(wrapper.get('[data-testid="book-list-row-read-status"]').attributes('aria-label')).toBe('Read')
  })

  it('marks an unread book as read from the row menu', async () => {
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })
    const item = wrapper.get('[data-testid="book-list-row-toggle-read"]')

    expect(item.text()).toBe('Mark as read')
    await item.trigger('click')

    expect(setStatusMock).toHaveBeenCalledWith(2, 'read')
    expect(wrapper.get('[data-testid="book-list-row-toggle-read"]').text()).toBe('Mark as unread')
  })

  it('emits the saved read status so the host list keeps it after a re-render', async () => {
    const saved = { status: 'read', source: 'manual', startedAt: null, finishedAt: null, updatedAt: '2026-09-23T00:00:00.000Z' }
    setStatusMock.mockResolvedValueOnce(saved)
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })

    await wrapper.get('[data-testid="book-list-row-toggle-read"]').trigger('click')
    await flushPromises()

    const updates = wrapper.emitted('update:book') as [BookCard][]
    expect(updates).toHaveLength(1)
    expect(updates[0]![0]).toMatchObject({ id: 2, readStatus: saved })
  })

  it('does not emit a book update when saving the read status fails', async () => {
    setStatusMock.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })

    await wrapper.get('[data-testid="book-list-row-toggle-read"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:book')).toBeUndefined()
  })

  it('marks a read book as unread and reverts when the request fails', async () => {
    setStatusMock.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(BookListRow, {
      props: { book: { ...presentBook, readStatus: { status: 'read' } as BookCard['readStatus'] } },
      global: globalStubs,
    })

    await wrapper.get('[data-testid="book-list-row-toggle-read"]').trigger('click')
    await flushPromises()

    expect(setStatusMock).toHaveBeenCalledWith(2, 'unread')
    expect(wrapper.get('[data-testid="book-list-row-toggle-read"]').text()).toBe('Mark as unread')
    expect(toastErrorMock).toHaveBeenCalledWith('Could not update the read status')
  })

  it('gives the row menu a labelled 44px touch target', () => {
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })
    const trigger = wrapper.get('[data-testid="book-list-row-menu"]')

    expect(trigger.classes()).toContain('size-11')
    expect(trigger.attributes('aria-label')).toContain('Available Book')
  })

  it('toggles read state when a row is swiped left past the threshold', async () => {
    const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })
    const row = wrapper.get('[data-testid="book-list-row"] > .flex.items-center').element

    await dispatchTouch(row, 'pointerdown', 200)
    await dispatchTouch(row, 'pointermove', 180)
    await dispatchTouch(row, 'pointermove', 100)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="book-list-row-swipe-action"]').exists()).toBe(true)
    await dispatchTouch(row, 'pointerup', 100)
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(setStatusMock).toHaveBeenCalledWith(2, 'read')
    expect(wrapper.emitted('action')).toBeUndefined()
  })

  it('range-selects on long press while in selection mode', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(BookListRow, { props: { book: presentBook, selectionMode: true }, global: globalStubs })
      const row = wrapper.get('[data-testid="book-list-row"] > .flex.items-center').element

      await dispatchTouch(row, 'pointerdown')
      vi.advanceTimersByTime(500)
      await dispatchTouch(row, 'pointerup')
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      const selects = wrapper.emitted('select') as [MouseEvent][]
      expect(selects).toHaveLength(1)
      expect(selects[0]![0].shiftKey).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not open the book on the click that trails a long press', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(BookListRow, { props: { book: presentBook }, global: globalStubs })
      const row = wrapper.get('[data-testid="book-list-row"] > .flex.items-center').element

      await dispatchTouch(row, 'pointerdown')
      vi.advanceTimersByTime(500)
      await dispatchTouch(row, 'pointerup')
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      expect(wrapper.emitted('action')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
