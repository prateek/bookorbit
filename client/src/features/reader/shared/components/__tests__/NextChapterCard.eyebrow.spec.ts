import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NextChapterCard from '../NextChapterCard.vue'

const nextBook = { bookId: 12, fileId: 34, format: 'epub', title: 'The Long Road', seriesIndex: '42' }

describe('NextChapterCard eyebrow', () => {
  it('says the chapter has ended and leaves "Next chapter" to the button', () => {
    const wrapper = mount(NextChapterCard, { props: { nextBook, markedRead: false } })

    expect(wrapper.text()).toContain('End of chapter')
    expect(wrapper.text().split('Next chapter')).toHaveLength(2)
    expect(wrapper.get('[data-testid="reader-end-card-next"]').text()).toContain('Next chapter')
  })
})
