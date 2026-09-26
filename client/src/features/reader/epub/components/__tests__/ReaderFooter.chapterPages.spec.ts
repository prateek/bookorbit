import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReaderFooter from '../ReaderFooter.vue'

const global = {
  stubs: {
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
  },
}

const props = {
  fraction: 0.33,
  sectionIndex: 2,
  totalSections: 5,
  sectionFractions: [0, 0.2, 0.4, 0.6, 0.8, 1],
  chapterStartFraction: 0.2,
  chapterEndFraction: 0.4,
  sectionPages: 10 as number | null,
}

async function jump(sectionPages: number | null, value: string) {
  const wrapper = mount(ReaderFooter, { props: { ...props, sectionPages }, global })
  await wrapper.get('button[aria-label="Jump to location"]').trigger('click')
  const input = wrapper.get('input[type="text"]')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  return wrapper
}

describe('ReaderFooter page jump', () => {
  it('lands on the last page of the chapter', async () => {
    const seek = (await jump(10, 'p10')).emitted('seek')?.[0]?.[0] as number
    const anchor = (seek - props.chapterStartFraction) / (props.chapterEndFraction - props.chapterStartFraction)

    expect(Math.round(anchor * 9) + 1).toBe(10)
  })

  it('ignores a page past the end of the chapter', async () => {
    expect((await jump(10, 'p11')).emitted('seek')).toBeUndefined()
  })

  it('ignores a page in scrolled flow, which has no pages', async () => {
    expect((await jump(null, 'p2')).emitted('seek')).toBeUndefined()
  })
})
