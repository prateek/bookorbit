import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NextChapterCard from '../NextChapterCard.vue'

const nextBook = { bookId: 12, fileId: 34, format: 'epub', title: 'The Long Road', seriesIndex: '42' }

describe('NextChapterCard when caught up', () => {
  it('says the series is caught up, with the date this chapter arrived', () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook: null, caughtUpSince: '2026-09-22T12:00:00Z', markedRead: false } })

    expect(wrapper.text()).toContain("You're caught up")
    expect(wrapper.text()).toContain('Latest chapter, added Sep 22')
    expect(wrapper.text()).not.toContain('End of book')
  })

  it('names the next chapter when there is one', () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, caughtUpSince: '2026-09-22T12:00:00Z', markedRead: false } })

    expect(wrapper.text()).toContain('#42 The Long Road')
    expect(wrapper.text()).not.toContain("You're caught up")
  })
})
