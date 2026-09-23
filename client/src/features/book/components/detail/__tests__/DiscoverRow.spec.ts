import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import type { RelatedShelfItem, SeriesBookRecommendation } from '@bookorbit/types'
import DiscoverRow from '../DiscoverRow.vue'
import BookCarousel from '../BookCarousel.vue'
import SeriesChapterStrip from '../SeriesChapterStrip.vue'

const mocks = vi.hoisted(() => ({
  api: vi.fn<(input: string) => Promise<Response>>(),
}))

vi.mock('@/lib/api', () => ({ api: mocks.api }))

function seriesBook(id: number): SeriesBookRecommendation {
  return {
    id,
    title: `Chapter ${id}`,
    coverAspectRatio: '2/3',
    updatedAt: null,
    seriesIndex: String(id),
    hasCover: false,
    authors: [],
    readStatus: null,
  }
}

function seriesCard(seriesId: number, name: string): RelatedShelfItem {
  return {
    kind: 'series',
    seriesId,
    name,
    authors: ['Actus'],
    bookCount: 549,
    readCount: 12,
    readingCount: 0,
    isSerial: true,
    coverBookId: seriesId * 10,
    coverUpdatedAt: null,
    hasCover: true,
    coverAspectRatio: '2/3',
  }
}

function bookCard(id: number): RelatedShelfItem {
  return { kind: 'book', id, title: `Short ${id}`, coverAspectRatio: '2/3', updatedAt: null, hasCover: false, authors: [], readStatus: null }
}

function respondWith(data: { series?: SeriesBookRecommendation[]; author?: RelatedShelfItem[]; similar?: RelatedShelfItem[] }) {
  mocks.api.mockImplementation(async (input: string) => {
    let body: unknown = []
    if (input.endsWith('/series-books')) body = data.series ?? []
    else if (input.includes('/author-books')) body = data.author ?? []
    else if (input.includes('/recommendations')) body = data.similar ?? []
    return { ok: true, status: 200, json: async () => body } as Response
  })
}

function mountRow(props: Partial<InstanceType<typeof DiscoverRow>['$props']> = {}) {
  return shallowMount(DiscoverRow, {
    props: { bookId: 600, seriesId: 3, seriesName: 'Serial', authorCount: 1, authorName: 'Actus', ...props },
  })
}

describe('DiscoverRow', () => {
  beforeEach(() => {
    mocks.api.mockReset()
  })

  it('lists the chapters around the current one and keeps it in the desktop carousel', async () => {
    respondWith({ series: [seriesBook(599), seriesBook(600), seriesBook(601)] })
    const wrapper = mountRow()
    await flushPromises()

    const strip = wrapper.getComponent(SeriesChapterStrip)
    expect(strip.props('books').map((book) => book.id)).toEqual([599, 600, 601])
    expect(strip.props('currentBookId')).toBe(600)
    const carousel = wrapper.findAllComponents(BookCarousel)[0]!
    expect(carousel.props('books').map((book) => book.id)).toEqual([599, 600, 601])
    expect(carousel.props('currentBookId')).toBe(600)
    expect(carousel.props('captioned')).toBe(true)
    expect(wrapper.emitted('series-books')?.at(-1)?.[0]).toHaveLength(3)
  })

  it('leaves the series section out when the window holds only the current book', async () => {
    respondWith({ series: [seriesBook(600)] })
    const wrapper = mountRow()
    await flushPromises()

    expect(wrapper.find('[data-test="discover-series"]').exists()).toBe(false)
  })

  it('asks for series-grouped author and similar shelves', async () => {
    respondWith({})
    mountRow()
    await flushPromises()

    const urls = mocks.api.mock.calls.map(([url]) => url)
    expect(urls).toContain('/api/v1/books/600/author-books?group=series')
    expect(urls).toContain('/api/v1/books/600/recommendations?group=series')
  })

  it('shows one card per other serial by the author, linking to the series', async () => {
    respondWith({ author: [seriesCard(41, 'Rise of the Living Forge'), bookCard(77)] })
    const wrapper = mountRow()
    await flushPromises()

    const section = wrapper.get('[data-test="discover-author"]')
    expect(section.text()).toContain('More by Actus')
    const cards = section.getComponent(BookCarousel).props('books')
    expect(cards[0]).toMatchObject({
      key: 'series-41',
      id: 410,
      title: 'Rise of the Living Forge',
      to: { name: 'series-detail', params: { seriesId: 41 } },
      caption: '549 chapters · 12 read',
    })
    expect(cards[1]).toMatchObject({ id: 77, title: 'Short 77' })
  })

  it('drops similar items that the author shelf already shows', async () => {
    respondWith({ author: [seriesCard(41, 'Forge')], similar: [seriesCard(41, 'Forge'), seriesCard(50, 'Chrysalis')] })
    const wrapper = mountRow()
    await flushPromises()

    const cards = wrapper.get('[data-test="discover-similar"]').getComponent(BookCarousel).props('books')
    expect(cards.map((card) => card.key)).toEqual(['series-50'])
  })

  it('ignores a response for a book the reader has already left', async () => {
    let resolveStale: ((value: Response) => void) | undefined
    mocks.api.mockImplementation((input: string) => {
      if (input.includes('/600/author-books')) {
        return new Promise<Response>((resolve) => {
          resolveStale = resolve
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] } as unknown as Response)
    })
    const wrapper = mountRow()
    await wrapper.setProps({ bookId: 601 })
    await flushPromises()

    resolveStale?.({ ok: true, status: 200, json: async () => [seriesCard(41, 'Stale')] } as unknown as Response)
    await flushPromises()

    expect(wrapper.find('[data-test="discover-author"]').exists()).toBe(false)
  })
})
