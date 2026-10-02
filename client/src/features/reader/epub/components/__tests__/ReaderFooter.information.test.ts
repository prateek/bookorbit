import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import ReaderFooter from '../ReaderFooter.vue'
import { READER_PAGE_CONTEXT } from '../../composables/readerPageContext'

function footer(flow: 'paginated' | 'scrolled', informationDisplay: 'hidden' | 'progress' | 'full') {
  return mount(ReaderFooter, {
    props: {
      informationDisplay,
      scrolledText: flow === 'scrolled',
      fraction: 0.3,
      sectionIndex: 1,
      totalSections: 3,
      sectionFractions: [],
      chapterStartFraction: 0.1,
      chapterEndFraction: 0.9,
      sectionPages: null,
      summary: '30% of chapter',
    },
    global: {
      stubs: {
        Tooltip: { template: '<div><slot /></div>' },
        TooltipTrigger: { template: '<div><slot /></div>' },
        TooltipContent: true,
        teleport: true,
      },
      provide: { [READER_PAGE_CONTEXT as symbol]: { mode: computed(() => ({ fg: '#000', bg: '#fff', link: '#00f' })), flow: ref(flow) } },
    },
  })
}

describe.each(['paginated', 'scrolled'] as const)('%s reading information', (flow) => {
  it('hides persistent information without hiding navigation controls', () => {
    const wrapper = footer(flow, 'hidden')
    expect(wrapper.find('[data-testid="scroll-strip"]').exists()).toBe(false)
    expect(wrapper.find('input[type="range"]').exists()).toBe(true)
  })
  it('shows only a thin progress line', () => {
    const wrapper = footer(flow, 'progress')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('30')
    expect(wrapper.find('[data-testid="scroll-summary"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="scroll-strip"]').classes()).toContain('pb-[env(safe-area-inset-bottom)]')
  })
})

it('keeps full scroll information above the bottom safe area', () => {
  const wrapper = footer('scrolled', 'full')
  expect(wrapper.get('[data-testid="scroll-strip"]').classes()).toContain('pb-[env(safe-area-inset-bottom)]')
  expect(wrapper.get('[data-testid="scroll-summary"]').text()).toBe('30% of chapter')
})
