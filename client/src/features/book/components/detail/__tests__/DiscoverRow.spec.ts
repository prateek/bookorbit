import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import type { SeriesBookRecommendation } from '@bookorbit/types'
import DiscoverRow from '../DiscoverRow.vue'
import BookCarousel from '../BookCarousel.vue'

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

function respondWith(series: SeriesBookRecommendation[]) {
  mocks.api.mockImplementation(async (input: string) => {
    const data = input.endsWith('/series-books') ? series : []
    return { ok: true, status: 200, json: async () => data } as Response
  })
}

describe('DiscoverRow series shelf', () => {
  beforeEach(() => {
    mocks.api.mockReset()
  })

  it('keeps the current chapter in the series shelf so the carousel can center on it', async () => {
    respondWith([seriesBook(599), seriesBook(600), seriesBook(601)])
    const wrapper = shallowMount(DiscoverRow, { props: { bookId: 600, seriesName: 'Serial', authorCount: 0 } })
    await flushPromises()

    const carousel = wrapper.getComponent(BookCarousel)
    expect(carousel.props('books').map((book) => book.id)).toEqual([599, 600, 601])
    expect(carousel.props('currentBookId')).toBe(600)
    expect(wrapper.emitted('series-books')?.at(-1)?.[0]).toHaveLength(3)
  })

  it('hides the series pill when the window holds only the current book', async () => {
    respondWith([seriesBook(600)])
    const wrapper = shallowMount(DiscoverRow, { props: { bookId: 600, seriesName: 'Serial', authorCount: 0 } })
    await flushPromises()

    expect(wrapper.text()).not.toContain('More in Series')
  })
})
