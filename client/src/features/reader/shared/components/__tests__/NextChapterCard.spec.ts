import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NextChapterCard from '../NextChapterCard.vue'

const nextBook = { bookId: 12, fileId: 34, format: 'epub', title: 'The Long Road', seriesIndex: '42' }

describe('NextChapterCard', () => {
  it('names the next chapter and emits the actions', async () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: false } })

    expect(wrapper.text()).toContain('#42 The Long Road')

    await wrapper.get('[data-testid="reader-end-card-next"]').trigger('click')
    await wrapper.get('[data-testid="reader-end-card-mark-read"]').trigger('click')

    expect(wrapper.emitted('openNext')).toHaveLength(1)
    expect(wrapper.emitted('markRead')).toHaveLength(1)
  })

  it('offers only "Mark as read" when the series has no next book', () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook: null, markedRead: false } })

    expect(wrapper.find('[data-testid="reader-end-card-next"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reader-end-card-mark-read"]').exists()).toBe(true)
  })

  it('disables "Mark as read" once the book is read', () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: true } })

    expect(wrapper.get('[data-testid="reader-end-card-mark-read"]').attributes('disabled')).toBeDefined()
  })
})
