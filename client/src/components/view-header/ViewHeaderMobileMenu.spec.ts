import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ViewHeaderMobileMenu from './ViewHeaderMobileMenu.vue'

const stubs = {
  DropdownMenu: { template: '<div><slot /></div>' },
  DropdownMenuTrigger: { template: '<div><slot /></div>' },
  DropdownMenuContent: { template: '<div><slot /></div>' },
  DropdownMenuItem: { template: '<button><slot /></button>' },
  DropdownMenuSeparator: { template: '<hr />' },
  DropdownMenuRadioGroup: { props: ['modelValue'], template: '<div data-testid="view-mode-group" :data-value="modelValue"><slot /></div>' },
  DropdownMenuRadioItem: { props: ['value'], template: '<div><slot /></div>' },
}

describe('ViewHeaderMobileMenu', () => {
  it('checks List when the saved view mode is table, since phones render table as the list', () => {
    const wrapper = mount(ViewHeaderMobileMenu, { props: { viewMode: 'table' }, global: { stubs } })
    expect(wrapper.get('[data-testid="view-mode-group"]').attributes('data-value')).toBe('list')
  })

  it('keeps grid and list as they are', () => {
    const wrapper = mount(ViewHeaderMobileMenu, { props: { viewMode: 'grid' }, global: { stubs } })
    expect(wrapper.get('[data-testid="view-mode-group"]').attributes('data-value')).toBe('grid')
  })

  it('labels the trigger and widens its touch area to 44px without growing the header', () => {
    const wrapper = mount(ViewHeaderMobileMenu, { props: { viewMode: 'grid' }, global: { stubs } })
    const trigger = wrapper.get('[data-testid="view-header-mobile-menu-trigger"]')
    expect(trigger.attributes('aria-label')).toBe('More options')
    expect(trigger.classes()).toEqual(expect.arrayContaining(['h-8', 'w-8', 'after:-inset-1.5']))
  })
})
