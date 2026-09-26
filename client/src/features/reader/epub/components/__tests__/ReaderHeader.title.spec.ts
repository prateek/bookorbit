import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReaderHeader from '../ReaderHeader.vue'

const global = {
  stubs: {
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
    Popover: { template: '<div><slot /></div>' },
    PopoverTrigger: { template: '<div><slot /></div>' },
    PopoverContent: { template: '<div><slot /></div>' },
    ReaderSettingsSheet: { template: '<div><slot /></div>' },
  },
}

function titleLines(props: Record<string, unknown>) {
  const wrapper = mount(ReaderHeader, {
    props: { chapterTitle: 'Chapter 430', isBookmarked: false, settingsOpen: false, footerRight: 'time-left' as const, ...props },
    global,
  })
  return wrapper.findAll('p').map((p) => p.text())
}

describe('ReaderHeader title', () => {
  it('puts the series above the chapter', () => {
    const lines = titleLines({ seriesTitle: 'Rise of the Living Forge' })

    expect(lines.indexOf('Rise of the Living Forge')).toBeGreaterThanOrEqual(0)
    expect(lines.indexOf('Rise of the Living Forge')).toBeLessThan(lines.indexOf('Chapter 430'))
  })

  it('shows only the chapter for a book outside a series', () => {
    expect(titleLines({ seriesTitle: null })).not.toContain('Rise of the Living Forge')
  })
})
