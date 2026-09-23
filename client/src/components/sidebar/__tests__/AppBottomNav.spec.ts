import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import AppBottomNav from '../AppBottomNav.vue'

const mocks = vi.hoisted(() => ({
  route: null as unknown as { name: string },
  openMobile: null as unknown as { value: boolean },
  setOpenMobile: vi.fn<(open: boolean) => void>(),
  scrollAppShellToTop: vi.fn<() => number>(),
}))

vi.mock('../scrollAppShellToTop', () => ({ scrollAppShellToTop: mocks.scrollAppShellToTop }))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRoute: () => mocks.route }
})

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ openMobile: mocks.openMobile, setOpenMobile: mocks.setOpenMobile }),
}))

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
}

function mountNav() {
  return mount(AppBottomNav, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('AppBottomNav', () => {
  beforeEach(() => {
    mocks.route = reactive({ name: 'dashboard' })
    mocks.openMobile = ref(false)
    mocks.setOpenMobile.mockReset()
    mocks.scrollAppShellToTop.mockReset()
  })

  it('renders the five labelled tabs in a navigation landmark hidden from md up', () => {
    const wrapper = mountNav()
    const nav = wrapper.get('nav')

    expect(nav.attributes('aria-label')).toBe('Quick navigation')
    expect(nav.classes()).toContain('md:hidden')
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['Home', 'Series', 'Search', 'Scopes', 'More'])
  })

  it('marks the series tab current on a series detail page', () => {
    mocks.route.name = 'series-detail'
    const wrapper = mountNav()

    expect(wrapper.get('[data-testid="bottom-nav-series"]').attributes('aria-current')).toBe('page')
    expect(wrapper.get('[data-testid="bottom-nav-home"]').attributes('aria-current')).toBeUndefined()
  })

  it('asks the layout to open search', async () => {
    const wrapper = mountNav()

    await wrapper.get('[data-testid="bottom-nav-search"]').trigger('click')

    expect(wrapper.emitted('search')).toHaveLength(1)
    expect(mocks.setOpenMobile).toHaveBeenCalledWith(false)
  })

  it('opens the drawer from More and shows it as the active tab while open', async () => {
    const wrapper = mountNav()

    await wrapper.get('[data-testid="bottom-nav-more"]').trigger('click')
    expect(mocks.setOpenMobile).toHaveBeenCalledWith(true)

    mocks.openMobile.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="bottom-nav-more"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[data-testid="bottom-nav-home"]').attributes('aria-current')).toBeUndefined()
  })

  it('scrolls the view to the top when the active tab is tapped on its root page', async () => {
    const wrapper = mountNav()

    await wrapper.get('[data-testid="bottom-nav-home"]').trigger('click')

    expect(mocks.scrollAppShellToTop).toHaveBeenCalledTimes(1)
  })

  it('does not scroll when tapping a different tab', async () => {
    const wrapper = mountNav()

    await wrapper.get('[data-testid="bottom-nav-series"]').trigger('click')

    expect(mocks.scrollAppShellToTop).not.toHaveBeenCalled()
  })

  it('lets the series tab navigate back to the list from a series detail page instead of scrolling', async () => {
    mocks.route.name = 'series-detail'
    const wrapper = mountNav()

    await wrapper.get('[data-testid="bottom-nav-series"]').trigger('click')

    expect(mocks.scrollAppShellToTop).not.toHaveBeenCalled()
  })

  it('scrolls on the scopes list but not on a scope detail page', async () => {
    mocks.route.name = 'smart-scopes'
    const wrapper = mountNav()

    await wrapper.get('[data-testid="bottom-nav-scopes"]').trigger('click')
    expect(mocks.scrollAppShellToTop).toHaveBeenCalledTimes(1)

    mocks.route.name = 'smartScope'
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="bottom-nav-scopes"]').trigger('click')
    expect(mocks.scrollAppShellToTop).toHaveBeenCalledTimes(1)
  })

  it('only closes the drawer when a tab is tapped while the drawer is open', async () => {
    mocks.openMobile.value = true
    const wrapper = mountNav()

    await wrapper.get('[data-testid="bottom-nav-home"]').trigger('click')

    expect(mocks.setOpenMobile).toHaveBeenCalledWith(false)
    expect(mocks.scrollAppShellToTop).not.toHaveBeenCalled()
  })
})
