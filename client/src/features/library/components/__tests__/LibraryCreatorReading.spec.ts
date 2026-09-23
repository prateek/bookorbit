import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LibraryCreatorReading from '../LibraryCreatorReading.vue'

describe('LibraryCreatorReading', () => {
  function mountComponent(countSeriesAsOneBook: boolean) {
    return mount(LibraryCreatorReading, {
      props: { readingThreshold: 0.25, markAsFinishedPercentComplete: 98, countSeriesAsOneBook },
    })
  }

  it('explains the series counting setting and emits the flipped value', async () => {
    const wrapper = mountComponent(false)

    expect(wrapper.text()).toContain('Count each series as one book')
    const toggle = wrapper.get('[role="switch"]')
    expect(toggle.attributes('aria-checked')).toBe('false')

    await toggle.trigger('click')
    expect(wrapper.emitted('update:countSeriesAsOneBook')).toEqual([[true]])
  })

  it('shows the setting as on when the library counts series as one book', async () => {
    const wrapper = mountComponent(true)

    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.emitted('update:countSeriesAsOneBook')).toEqual([[false]])
  })
})
