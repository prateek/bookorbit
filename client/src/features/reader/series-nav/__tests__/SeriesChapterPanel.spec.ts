import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookCard, SeriesBooksPage } from '@bookorbit/types'

vi.mock('@/features/series/api/series', () => ({
  fetchSeriesBooks: vi.fn<typeof import('@/features/series/api/series').fetchSeriesBooks>(),
}))

import { fetchSeriesBooks } from '@/features/series/api/series'
import SeriesChapterPanel from '../SeriesChapterPanel.vue'

const mockFetch = vi.mocked(fetchSeriesBooks)
const scrollIntoView = vi.fn<(arg?: ScrollIntoViewOptions) => void>()

function chapter(id: number, overrides: Partial<BookCard> = {}): BookCard {
  return {
    id,
    title: `Chapter ${id}`,
    seriesIndex: id,
    readStatus: null,
    readingProgress: 0,
    files: [{ id: id * 10, format: 'epub', role: 'primary' }],
    ...overrides,
  } as unknown as BookCard
}

function page(items: BookCard[], pageNumber = 0, total = items.length): SeriesBooksPage {
  return { items, total, page: pageNumber, size: 50, seriesInfo: { name: 'Serial' } } as SeriesBooksPage
}

async function mountPanel(bookId = 2, navigationLocked = false) {
  const wrapper = mount(SeriesChapterPanel, { props: { seriesId: 7, bookId, navigationLocked } })
  await flushPromises()
  return wrapper
}

function rows(wrapper: Awaited<ReturnType<typeof mountPanel>>) {
  return wrapper.findAll('[data-testid="series-chapter-panel-row"]')
}

describe('SeriesChapterPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  })

  it('highlights the chapter being read and scrolls it into view', async () => {
    mockFetch.mockResolvedValueOnce(page([chapter(1), chapter(2), chapter(3)]))
    const wrapper = await mountPanel(2)

    const current = rows(wrapper).filter((row) => row.attributes('aria-current') === 'location')
    expect(current).toHaveLength(1)
    expect(current[0]!.text()).toContain('Chapter 2')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })

  it('shows each chapter read state', async () => {
    mockFetch.mockResolvedValueOnce(
      page([chapter(1, { readStatus: { status: 'read' } as BookCard['readStatus'] }), chapter(2, { readingProgress: 40 }), chapter(3)]),
    )
    const wrapper = await mountPanel(2)

    const labels = rows(wrapper).map((row) => row.find('[aria-label]').attributes('aria-label'))
    expect(labels).toEqual(['Read', 'In progress', 'Unread'])
  })

  it('opens another chapter with its readable file and ignores a tap on the current one', async () => {
    mockFetch.mockResolvedValueOnce(page([chapter(1), chapter(2), chapter(3, { files: [] })]))
    const wrapper = await mountPanel(2)

    await rows(wrapper)[1]!.trigger('click')
    await rows(wrapper)[0]!.trigger('click')

    expect(wrapper.emitted('open')).toEqual([[{ bookId: 1, fileId: 10, format: 'epub' }]])
    expect(rows(wrapper)[2]!.attributes('disabled')).toBeDefined()
  })

  it('disables every chapter while narration holds the reader in place', async () => {
    mockFetch.mockResolvedValueOnce(page([chapter(1), chapter(2), chapter(3)]))
    const wrapper = await mountPanel(2, true)

    await rows(wrapper)[0]!.trigger('click')

    expect(wrapper.emitted('open')).toBeUndefined()
    expect(rows(wrapper).every((row) => row.attributes('disabled') !== undefined)).toBe(true)
  })

  it('loads earlier and later chapters on request', async () => {
    mockFetch.mockResolvedValueOnce(page([chapter(51), chapter(52)], 1, 150))
    const wrapper = await mountPanel(52)

    mockFetch.mockResolvedValueOnce(page([chapter(50)], 0, 150))
    await wrapper.get('[data-testid="series-chapters-earlier"]').trigger('click')
    await flushPromises()
    mockFetch.mockResolvedValueOnce(page([chapter(101)], 2, 150))
    await wrapper.get('[data-testid="series-chapters-later"]').trigger('click')
    await flushPromises()

    expect(rows(wrapper).map((row) => row.text())).toEqual([
      expect.stringContaining('Chapter 50'),
      expect.stringContaining('Chapter 51'),
      expect.stringContaining('Chapter 52'),
      expect.stringContaining('Chapter 101'),
    ])
    expect(wrapper.find('[data-testid="series-chapters-earlier"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="series-chapters-later"]').exists()).toBe(false)
  })

  it('offers a retry when the chapters cannot be loaded', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    const wrapper = await mountPanel(2)
    expect(wrapper.text()).toContain('Could not load the series chapters')

    mockFetch.mockResolvedValueOnce(page([chapter(2)]))
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(rows(wrapper)).toHaveLength(1)
  })
})
