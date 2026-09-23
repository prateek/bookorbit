import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { ReleaseHighlight } from '@bookorbit/types'

import HighlightItem from '../HighlightItem.vue'

const highlight: ReleaseHighlight = {
  title: 'Series as one book',
  body: 'A long body that used to stop mid-sentence after four lines on a phone.',
  icon: 'sparkles',
  media: [],
}

describe('HighlightItem', () => {
  it('shows the whole highlight on the archive page', () => {
    const wrapper = mount(HighlightItem, { props: { highlight } })
    expect(wrapper.get('p + p').classes()).not.toContain('line-clamp-4')
  })

  it('still clamps the body in the compact popup', () => {
    const wrapper = mount(HighlightItem, { props: { highlight, compact: true } })
    expect(wrapper.get('p + p').classes()).toContain('line-clamp-4')
  })
})
