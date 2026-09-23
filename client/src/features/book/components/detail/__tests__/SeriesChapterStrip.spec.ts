import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { ReadStatus, SeriesBookRecommendation } from '@bookorbit/types'

import SeriesChapterStrip from '../SeriesChapterStrip.vue'

const RouterLinkStub = defineComponent({
  name: 'RouterLink',
  props: ['to', 'replace'],
  setup(props, { slots, attrs }) {
    return () => h('a', { ...attrs, 'data-to': JSON.stringify(props.to), 'data-replace': String(props.replace) }, slots.default?.())
  },
})

function chapter(id: number, status: ReadStatus | null = null, title = `Chapter ${id}`): SeriesBookRecommendation {
  return {
    id,
    title,
    coverAspectRatio: '2/3',
    updatedAt: null,
    seriesIndex: String(id),
    hasCover: false,
    authors: [],
    readStatus: status ? { status, source: 'auto', startedAt: null, finishedAt: null, updatedAt: '2026-01-01T00:00:00.000Z' } : null,
  }
}

function mountStrip(books: SeriesBookRecommendation[], currentBookId: number) {
  return mount(SeriesChapterStrip, { props: { books, currentBookId }, global: { stubs: { RouterLink: RouterLinkStub } } })
}

function rowIds(wrapper: ReturnType<typeof mountStrip>) {
  return wrapper.findAll('li').map((row) => Number(row.attributes('data-book-id')))
}

describe('SeriesChapterStrip', () => {
  const window = Array.from({ length: 26 }, (_, i) => chapter(998 + i))

  it('shows two chapters before the current one and three after', () => {
    expect(rowIds(mountStrip(window, 1003))).toEqual([1001, 1002, 1003, 1004, 1005, 1006])
  })

  it('stays full at the end of the serial', () => {
    expect(rowIds(mountStrip(window.slice(0, 6), 1003))).toEqual([998, 999, 1000, 1001, 1002, 1003])
  })

  it('marks the current chapter instead of linking to it', () => {
    const wrapper = mountStrip(window, 1003)
    const current = wrapper.get('[data-book-id="1003"] [data-test="series-chapter-strip-row"]')

    expect(current.element.tagName).toBe('DIV')
    expect(current.attributes('aria-current')).toBe('page')
    expect(current.text()).toContain('#1003')
    expect(current.text()).toContain('You are here')
  })

  it('opens a neighbouring chapter in place of the current page', () => {
    const wrapper = mountStrip(window, 1003)
    const next = wrapper.get('[data-book-id="1004"] a')

    expect(JSON.parse(next.attributes('data-to')!)).toEqual({ name: 'book-detail', params: { bookId: 1004 } })
    expect(next.attributes('data-replace')).toBe('true')
  })

  it('names the read state of each chapter and decodes titles', () => {
    const wrapper = mountStrip([chapter(1, 'read'), chapter(2, 'reading', 'Mother&#39;s Love'), chapter(3)], 2)

    expect(wrapper.get('[data-book-id="1"]').text()).toContain('Read')
    expect(wrapper.get('[data-book-id="2"]').text()).toContain("Mother's Love")
    expect(wrapper.get('[data-book-id="2"]').text()).toContain('In progress')
    expect(wrapper.get('[data-book-id="3"]').text()).toContain('Unread')
  })
})
