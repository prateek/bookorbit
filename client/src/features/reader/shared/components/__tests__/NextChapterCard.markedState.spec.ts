import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NextChapterCard from '../NextChapterCard.vue'

const nextBook = { bookId: 12, fileId: 34, format: 'epub', title: 'The Long Road', seriesIndex: '42' }

describe('NextChapterCard read state', () => {
  it('says the chapter is marked as read instead of offering a disabled button', () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: true } })

    expect(wrapper.find('[data-testid="reader-end-card-mark-read"]').exists()).toBe(false)
    const status = wrapper.get('[data-testid="reader-end-card-marked-read"]')
    expect(status.attributes('role')).toBe('status')
    expect(status.text()).toBe('Marked as read')
    expect(wrapper.find('[data-testid="reader-end-card-next"]').exists()).toBe(true)
  })

  it('offers "Mark as read" while the chapter is unread', async () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: false } })

    expect(wrapper.find('[data-testid="reader-end-card-marked-read"]').exists()).toBe(false)
    const button = wrapper.get('[data-testid="reader-end-card-mark-read"]')
    expect(button.text()).toBe('Mark as read')
    await button.trigger('click')
    expect(wrapper.emitted('markRead')).toHaveLength(1)
  })

  it('swaps the button for the status line when the read state changes', async () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: false } })

    await wrapper.setProps({ markedRead: true })

    expect(wrapper.find('[data-testid="reader-end-card-mark-read"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reader-end-card-marked-read"]').exists()).toBe(true)
  })

  it('holds the button while a mark is in flight', () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: false, markingRead: true } })

    expect(wrapper.get('[data-testid="reader-end-card-mark-read"]').attributes('disabled')).toBeDefined()
  })
})
