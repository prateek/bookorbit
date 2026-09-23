import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const apiMock = vi.hoisted(() => vi.fn<(input: RequestInfo | URL) => Promise<Response>>())

vi.mock('@/lib/api', () => ({ api: apiMock }))
vi.mock('vue-echarts', () => ({
  default: { name: 'VChart', props: ['option'], emits: ['click'], template: '<div class="vchart" @click="$emit(\'click\', { dataIndex: 0 })" />' },
}))
vi.mock('@/features/statistics/composables/useStatisticsConfig', () => ({
  useStatisticsConfig: () => ({ filters: { value: { libraryIds: [] } } }),
}))

import FormatDistributionChart from '../FormatDistributionChart.vue'
import LargestBooksChart from '../LargestBooksChart.vue'
import MetadataFreshnessGaugeChart from '../MetadataFreshnessGaugeChart.vue'

function respondWith(data: unknown) {
  apiMock.mockResolvedValue({ ok: true, status: 200, json: async () => data } as Response)
}

describe('library statistics charts', () => {
  it('neutralises the freshness gauge when no book was ever matched to a metadata provider', async () => {
    respondWith({
      totalBooks: 4331,
      neverFetchedCount: 4331,
      fresh30dCount: 0,
      stale31To90dCount: 0,
      stale91To180dCount: 0,
      staleOver180dCount: 0,
      freshnessScore: 0,
    })
    const wrapper = mount(MetadataFreshnessGaugeChart)
    await flushPromises()

    expect(wrapper.find('.vchart').exists()).toBe(false)
    expect(wrapper.text()).toContain('No metadata fetched yet')
  })

  it('drops the format donut when the library holds a single format', async () => {
    respondWith({ items: [{ format: 'epub', count: 4331 }], unknownCount: 0 })
    const wrapper = mount(FormatDistributionChart)
    await flushPromises()

    expect(wrapper.attributes('data-chart-not-applicable')).toBe('')
  })

  it('opens the book behind a tapped bar', async () => {
    respondWith({
      items: [
        { id: 7, title: 'Chapter 46', sizeBytes: 5_000_000, format: 'epub' },
        { id: 9, title: 'Chapter 13', sizeBytes: 300_000, format: 'epub' },
      ],
      unknownCount: 0,
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/book/:bookId', name: 'book-detail', component: { template: '<div />' } },
      ],
    })
    const push = vi.spyOn(router, 'push')
    const wrapper = mount(LargestBooksChart, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('.vchart').trigger('click')

    // Bars run smallest to largest, so the first bar is the smaller file.
    expect(push).toHaveBeenCalledWith({ name: 'book-detail', params: { bookId: 9 } })
  })
})
