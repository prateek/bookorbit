import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { computed } from 'vue'
import SettingsHome from '../SettingsHome.vue'
import { settingsHomeGuard } from '../lib/settings-home'

const push = vi.fn<(to: { name: string }) => void>()

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'settings-home' }),
  useRouter: () => ({ push }),
}))

vi.mock('../composables/useSettingsNavStatus', async () => {
  const { computed: makeComputed } = await import('vue')
  return { useSettingsNavStatus: () => ({ isLibraryScanning: makeComputed(() => false) }) }
})

vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({
    isSuperuser: computed(() => true),
    userPermissions: computed(() => []),
    isDemoRestrictedAccount: computed(() => false),
  }),
}))

function mountHome() {
  return mount(SettingsHome, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('SettingsHome', () => {
  beforeEach(() => push.mockClear())

  it('lists every settings group as an iOS style grouped list', () => {
    const wrapper = mountHome()
    expect(wrapper.findAll('[data-testid="settings-home-group"]').map((node) => node.text())).toEqual([
      'You',
      'Library',
      'Devices',
      'Accounts',
      'Server',
    ])
    for (const row of wrapper.findAll('[data-testid="settings-home-item"]')) {
      expect(row.classes()).toEqual(expect.arrayContaining(['min-h-11', 'text-[17px]']))
    }
  })

  it('discloses a grouping row in place instead of leaving the list', async () => {
    const wrapper = mountHome()
    const display = wrapper.findAll('[data-testid="settings-home-item"]').find((node) => node.text().includes('Display'))

    expect(display?.attributes('aria-expanded')).toBe('false')
    await display?.trigger('click')

    expect(push).not.toHaveBeenCalled()
    expect(display?.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[data-testid="settings-home-child"]').map((node) => node.text())).toContain('Theme')
  })

  it('links leaf rows straight to their page', () => {
    const wrapper = mountHome()
    const targets = wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))
    expect(targets).toContainEqual({ name: 'settings-account-profile' })
  })

  it('searches every page the user can open', async () => {
    const wrapper = mountHome()
    await wrapper.get('[data-testid="settings-home-search"]').setValue('theme')

    const results = wrapper.findAll('[data-testid="settings-home-result"]')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.text()).toContain('Theme')
    expect(wrapper.find('[data-testid="settings-home-group"]').exists()).toBe(false)
  })
})

describe('settingsHomeGuard', () => {
  const originalMatchMedia = window.matchMedia

  /** Evaluates min-width and max-width queries the way a browser at `width` CSS px would. */
  function stubWidth(width: number) {
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockImplementation((query) => {
      const min = /min-width:\s*(\d+)px/.exec(query)
      const max = /max-width:\s*(\d+)px/.exec(query)
      const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
      return { matches } as MediaQueryList
    })
  }

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('keeps phones on the settings index', () => {
    stubWidth(390)
    expect(settingsHomeGuard()).toBe(true)
  })

  it('keeps the index at exactly 768px, where the app still shows the drawer instead of the settings sidebar', () => {
    stubWidth(768)
    expect(settingsHomeGuard()).toBe(true)
  })

  it('sends wider screens to the first page, since the sidebar already lists every page', () => {
    stubWidth(1024)
    expect(settingsHomeGuard()).toEqual({ name: 'settings-appearance-theme', replace: true })
  })
})
