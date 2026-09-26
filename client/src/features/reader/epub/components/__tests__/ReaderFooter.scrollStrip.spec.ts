import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import ReaderFooter from '../ReaderFooter.vue'
import { READER_PAGE_CONTEXT } from '../../composables/readerPageContext'

function mountInFlow(flow: 'paginated' | 'scrolled', scrolledText?: boolean) {
  return mount(ReaderFooter, {
    props: {
      fraction: 0.3,
      sectionIndex: 1,
      totalSections: 3,
      sectionFractions: [0, 0.1, 0.9, 1],
      chapterStartFraction: 0.1,
      chapterEndFraction: 0.9,
      sectionPages: null,
      summary: '30% of chapter · 9 min left in chapter',
      scrolledText,
    },
    global: {
      stubs: {
        Tooltip: { template: '<div><slot /></div>' },
        TooltipTrigger: { template: '<div><slot /></div>' },
        TooltipContent: { template: '<div />' },
        teleport: true,
      },
      provide: { [READER_PAGE_CONTEXT as symbol]: { mode: computed(() => ({ fg: '#ffd595', bg: '#342e25', link: '#48d1cc' })), flow: ref(flow) } },
    },
  })
}

describe('ReaderFooter scroll strip', () => {
  it('says where the reader is while scrolling, on the page color', () => {
    const strip = mountInFlow('scrolled').get('[data-testid="scroll-strip"]')

    expect(strip.get('[data-testid="scroll-summary"]').text()).toBe('30% of chapter · 9 min left in chapter')
    expect(strip.attributes('style')).toContain('background: #342e25')
  })

  it('stays out of paginated flow, which has its own bottom line', () => {
    expect(mountInFlow('paginated').find('[data-testid="scroll-strip"]').exists()).toBe(false)
  })

  it('keeps only the thin progress line when the book paginates despite a scrolled setting', () => {
    const strip = mountInFlow('scrolled', false).get('[data-testid="scroll-strip"]')

    expect(strip.find('[data-testid="scroll-progress"]').exists()).toBe(true)
    expect(strip.find('[data-testid="scroll-summary"]').exists()).toBe(false)
    expect(strip.attributes('style') ?? '').not.toContain('background')
  })
})
