import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReaderSidebar from '../ReaderSidebar.vue'

const global = {
  stubs: {
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
  },
}

const props = {
  chapters: [{ label: 'Chapter 1', href: 'ch1.xhtml' }],
  bookmarks: [],
  annotations: [],
  currentCfi: null,
  locationMetaByCfi: {},
  activeHref: '',
  expandedHrefs: new Set<string>(),
  pinned: false,
}

describe('ReaderSidebar chapters slot', () => {
  it('shows the slotted list in place of the contents list', () => {
    const wrapper = mount(ReaderSidebar, { props, global, slots: { chapters: '<p data-testid="slotted">Series chapters</p>' } })

    expect(wrapper.find('[data-testid="slotted"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Chapter 1')
  })

  it('shows the contents list when nothing is slotted', () => {
    const wrapper = mount(ReaderSidebar, { props, global })

    expect(wrapper.text()).toContain('Chapter 1')
  })

  it('shows the slotted list only on the contents tab', async () => {
    const wrapper = mount(ReaderSidebar, { props, global, slots: { chapters: '<p data-testid="slotted">Series chapters</p>' } })

    await wrapper.get('button[aria-label="Bookmarks"]').trigger('click')

    expect(wrapper.find('[data-testid="slotted"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No bookmarks yet')
  })
})
