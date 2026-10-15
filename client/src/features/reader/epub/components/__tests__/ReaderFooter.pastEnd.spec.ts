import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReaderFooter from '../ReaderFooter.vue'

const globalStubs = {
  stubs: {
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
  },
}

const lastSection = {
  fraction: 0.9,
  sectionIndex: 4,
  totalSections: 5,
  sectionFractions: [0, 0.2, 0.4, 0.6, 0.8, 1],
  chapterStartFraction: 0.8,
  chapterEndFraction: 1,
  sectionPages: 10,
}

function mountFooter(props: Partial<InstanceType<typeof ReaderFooter>['$props']> = {}) {
  const wrapper = mount(ReaderFooter, { props: { ...lastSection, ...props }, global: globalStubs })
  return { wrapper, next: wrapper.get('button[aria-label="Next section"]') }
}

describe('ReaderFooter next on the last section', () => {
  it('turns past the end when an end card can show', async () => {
    const { wrapper, next } = mountFooter({ endCardAvailable: true })

    expect(next.attributes('disabled')).toBeUndefined()
    await next.trigger('click')

    expect(wrapper.emitted('pastEnd')).toHaveLength(1)
    expect(wrapper.emitted('nextSection')).toBeUndefined()
  })

  it('stays disabled when no end card can show', () => {
    expect(mountFooter({ endCardAvailable: false }).next.attributes('disabled')).toBeDefined()
    expect(mountFooter().next.attributes('disabled')).toBeDefined()
  })

  it('stays disabled while navigation is locked', () => {
    const { next } = mountFooter({ endCardAvailable: true, navigationLocked: true })
    expect(next.attributes('disabled')).toBeDefined()
  })

  it('still moves to the next section before the last one', async () => {
    const { wrapper, next } = mountFooter({ endCardAvailable: true, sectionIndex: 3, chapterStartFraction: 0.6, chapterEndFraction: 0.8 })

    await next.trigger('click')

    expect(wrapper.emitted('nextSection')).toHaveLength(1)
    expect(wrapper.emitted('pastEnd')).toBeUndefined()
  })
})
