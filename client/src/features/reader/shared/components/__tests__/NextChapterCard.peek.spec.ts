import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NextChapterCard from '../NextChapterCard.vue'

const nextBook = { bookId: 12, fileId: 34, format: 'epub', title: 'The Long Road', seriesIndex: '42' }

describe('NextChapterCard in peek mode', () => {
  it('offers the next chapter without "Mark as read"', async () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: false, peek: true } })

    expect(wrapper.find('[data-testid="reader-end-card-mark-read"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reader-end-card-marked-read"]').exists()).toBe(false)
    await wrapper.get('[data-testid="reader-end-card-next"]').trigger('click')
    expect(wrapper.emitted('openNext')).toHaveLength(1)
  })

  it('still says a chapter that is already read is marked as read', () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: true, peek: true } })

    expect(wrapper.get('[data-testid="reader-end-card-marked-read"]').text()).toBe('Marked as read')
  })

  it('can still be dismissed', async () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: false, peek: true } })

    await wrapper.get('button[aria-label="Dismiss"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
