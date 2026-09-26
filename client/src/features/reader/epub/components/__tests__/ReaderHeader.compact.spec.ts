import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ReaderHeader from '../ReaderHeader.vue'

const viewport = vi.hoisted(() => ({ isCompact: true }))

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()
  const { computed } = await import('vue')
  return { ...actual, useMediaQuery: () => computed(() => viewport.isCompact) }
})

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

function mountHeader() {
  return mount(ReaderHeader, {
    props: { chapterTitle: 'Chapter 430', isBookmarked: false, settingsOpen: false, footerRight: 'time-left' as const },
    global,
  })
}

describe('ReaderHeader on a phone', () => {
  it('keeps desktop-only controls out of the compact bar, including a phone turned sideways', () => {
    viewport.isCompact = true
    const wrapper = mountHeader()

    for (const label of ['Cycle footer info mode', 'Keyboard Shortcuts', 'Toggle tap zones', 'Pin menu']) {
      expect(wrapper.find(`button[aria-label="${label}"]`).exists()).toBe(false)
    }
  })

  it('shows them where the bar is not compact', () => {
    viewport.isCompact = false
    const wrapper = mountHeader()

    expect(wrapper.find('button[aria-label="Cycle footer info mode"]').exists()).toBe(true)
  })
})

describe('ReaderHeader title width', () => {
  it('caps the title at 40vw on wide screens and lets it fill the bar on phones', () => {
    viewport.isCompact = false
    const wide = mountHeader()
      .findAll('p')
      .find((p) => p.text() === 'Chapter 430')!
    expect(wide.classes()).toContain('max-w-[40vw]')
    expect(wide.classes()).not.toContain('max-w-full')

    viewport.isCompact = true
    const phone = mountHeader()
      .findAll('p')
      .find((p) => p.text() === 'Chapter 430')!
    expect(phone.classes()).toContain('max-w-full')
    expect(phone.classes()).not.toContain('max-w-[40vw]')
  })
})
