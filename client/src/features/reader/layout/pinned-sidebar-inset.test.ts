import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReaderSidebar from '../epub/components/ReaderSidebar.vue'
import { PINNED_SIDEBAR_INSET_CLASS, pinnedSidebarInset } from './pinned-sidebar-inset'

const global = {
  stubs: {
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
  },
}

const sidebarProps = {
  chapters: [],
  bookmarks: [],
  annotations: [],
  currentCfi: null,
  locationMetaByCfi: {},
  activeHref: '',
  expandedHrefs: new Set<string>(),
  pinned: true,
}

function widthsByBreakpoint(classes: string[], utility: 'w' | 'pl'): Record<string, string> {
  const pattern = new RegExp(`^(\\w+):${utility}-\\[(.+)\\]$`)
  return Object.fromEntries(
    classes.flatMap((name) => {
      const match = pattern.exec(name)
      return match ? [[match[1], match[2]]] : []
    }),
  )
}

describe('pinnedSidebarInset', () => {
  it('insets the page while the sidebar is open and pinned', () => {
    expect(pinnedSidebarInset(true, true)).toBe(PINNED_SIDEBAR_INSET_CLASS)
  })

  it('leaves the page full width when the sidebar is only overlaying it', () => {
    expect(pinnedSidebarInset(true, false)).toBe('')
  })

  it('leaves the page full width when a pinned sidebar is closed', () => {
    expect(pinnedSidebarInset(false, true)).toBe('')
    expect(pinnedSidebarInset(false, false)).toBe('')
  })

  it('never insets below the breakpoint where pinning is offered', () => {
    expect(PINNED_SIDEBAR_INSET_CLASS.split(' ').every((name) => /^(sm|md|lg|xl|2xl):/.test(name))).toBe(true)
  })

  it('matches the sidebar panel width at every breakpoint', () => {
    const wrapper = mount(ReaderSidebar, { props: sidebarProps, global })
    const panelClasses = wrapper.get('.sidebar-panel').classes()

    expect(widthsByBreakpoint(PINNED_SIDEBAR_INSET_CLASS.split(' '), 'pl')).toEqual(widthsByBreakpoint(panelClasses, 'w'))
  })
})
