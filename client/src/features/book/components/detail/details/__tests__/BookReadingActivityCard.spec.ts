import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BookReadingActivityCard from '../BookReadingActivityCard.vue'

describe('BookReadingActivityCard without sessions', () => {
  it('says not started for an unread book', () => {
    const wrapper = mount(BookReadingActivityCard, { props: { stats: null, readStatus: 'unread' } })

    expect(wrapper.text()).toContain('not started')
    expect(wrapper.text()).toContain('No reading sessions yet.')
  })

  it('reflects a manually marked status instead of not started', () => {
    const wrapper = mount(BookReadingActivityCard, { props: { stats: null, readStatus: 'read' } })

    expect(wrapper.text()).toContain('marked Read')
    expect(wrapper.text()).not.toContain('not started')
    expect(wrapper.text()).toContain('No reading sessions recorded.')
  })

  it('keeps the "yet" wording for books the reader still wants to read', () => {
    const wrapper = mount(BookReadingActivityCard, { props: { stats: null, readStatus: 'want_to_read' } })

    expect(wrapper.text()).toContain('marked Want to Read')
    expect(wrapper.text()).toContain('No reading sessions yet.')
  })
})
