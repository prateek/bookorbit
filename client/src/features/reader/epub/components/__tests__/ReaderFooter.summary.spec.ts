import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReaderFooter from '../ReaderFooter.vue'

describe('ReaderFooter summary', () => {
  it('says where the reader is above the controls', () => {
    const wrapper = mount(ReaderFooter, {
      props: {
        fraction: 0.25,
        sectionIndex: 1,
        totalSections: 3,
        sectionFractions: [0, 0.1, 0.9, 1],
        chapterStartFraction: 0.1,
        chapterEndFraction: 0.9,
        sectionPages: 13,
        summary: '5 of 13 · 6 min left in chapter',
      },
      global: {
        stubs: {
          Tooltip: { template: '<div><slot /></div>' },
          TooltipTrigger: { template: '<div><slot /></div>' },
          TooltipContent: { template: '<div />' },
        },
      },
    })

    expect(wrapper.get('[data-testid="footer-summary"]').text()).toBe('5 of 13 · 6 min left in chapter')
    expect(wrapper.get('button[aria-label="Jump to location"]').text()).toBe('25%')
  })
})
