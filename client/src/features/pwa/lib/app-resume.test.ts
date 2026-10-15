import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Permission } from '@bookorbit/types'
import { registerAuthGuard } from '@/router/guards/auth.guard'
import { offlineMode, registerOfflineGuard } from '@/features/offline/offline-mode'
import { installPwaResume } from './app-resume'

const user = ref<{ id: number; permissions: string[]; settings: Record<string, unknown>; isDefaultPassword?: boolean } | null>(null)
const cleanup: (() => void)[] = []
const Page = { template: '<div />' }
const STORAGE_KEY = 'bookorbit:pwa-resume'

vi.mock('@/features/auth/composables/useAuth', () => ({ useAuth: () => ({ user }) }))
vi.mock('@/features/auth/composables/useSetupStatus', () => ({
  useSetupStatus: () => ({ fetchSetupStatus: async () => false }),
}))
vi.mock('@/features/auth/composables/useLoginOptions', () => ({
  useLoginOptions: () => ({
    fetchLoginOptions: async () => undefined,
    loginOptions: ref({ passwordLoginEnabled: true }),
  }),
}))
vi.mock('@/composables/useChangePasswordDialog', () => ({ useChangePasswordDialog: () => ({ open: vi.fn<(force: boolean) => void>() }) }))

function signIn(id = 1) {
  user.value = { id, permissions: [], settings: {} }
}

function createApp(path = '/') {
  const history = createMemoryHistory()
  history.replace(path)
  const router = createRouter({
    history,
    routes: [
      { path: '/', name: 'dashboard', component: Page },
      { path: '/libraries', name: 'libraries', component: Page },
      { path: '/authors', name: 'authors', component: Page },
      { path: '/book/:bookId', name: 'book-detail', component: Page },
      { path: '/book/:bookId/files', redirect: (to) => ({ name: 'book-detail', params: to.params, query: { tab: 'files' } }) },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Page, meta: { offlineCapable: true } },
      { path: '/downloads', name: 'downloads', component: Page, meta: { offlineCapable: true } },
      { path: '/settings/admin/users', name: 'admin-users', component: Page, meta: { requiredPermission: Permission.ManageUsers } },
      { path: '/login', name: 'login', component: Page, meta: { public: true } },
      { path: '/oauth2-callback', name: 'oidc-callback', component: Page, meta: { public: true } },
      { path: '/magic', name: 'magic-link-login', component: Page, meta: { public: true } },
      { path: '/reset-password', name: 'reset-password', component: Page, meta: { public: true } },
      { path: '/:pathMatch(.*)*', component: Page },
    ],
  })
  registerAuthGuard(router)
  const stop = installPwaResume(router, user)
  cleanup.push(stop)
  registerOfflineGuard(router)
  return { router, start: () => router.push(path), stop }
}

function savedLocation() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
}

function seed(path: string, userId = 1) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, userId, path }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  signIn()
  vi.stubGlobal('navigator', { standalone: true })
})

afterEach(() => {
  for (const stop of cleanup.splice(0)) stop()
  offlineMode.value = false
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PWA last-screen restoration', () => {
  it('reopens the last reader after a fresh launch without needing a closing event', async () => {
    const first = createApp()
    await first.start()
    await first.router.push('/read/12/34?format=epub')
    first.stop()

    const reopened = createApp()
    await reopened.start()

    expect(reopened.router.currentRoute.value.fullPath).toBe('/read/12/34?format=epub')
    await reopened.router.push('/')
    expect(reopened.router.currentRoute.value.name).toBe('dashboard')
  })

  it('keeps reader format while letting saved progress replace old deep-link positions', async () => {
    const first = createApp('/read/12/34?format=pdf&page=6&cfi=old&checkpoint=20')
    await first.start()
    expect(first.router.currentRoute.value.query.page).toBe('6')
    first.stop()

    const reopened = createApp()
    await reopened.start()
    expect(reopened.router.currentRoute.value.fullPath).toBe('/read/12/34?format=pdf')
  })

  it.each(['mode=peek', 'mode=peek&mode=read'])('keeps the last resumable screen when previewing with %s', async (mode) => {
    seed('/read/56/78?format=epub')
    const first = createApp()
    await first.start()
    const preview = `/read/12/34?format=pdf&${mode}&page=6`
    await first.router.push(preview)
    expect(first.router.currentRoute.value.fullPath).toBe(preview)
    window.dispatchEvent(new Event('pagehide'))
    first.stop()

    const reopened = createApp()
    await reopened.start()
    expect(reopened.router.currentRoute.value.fullPath).toBe('/read/56/78?format=epub')
  })

  it('remembers a preview once the user starts tracked reading', async () => {
    seed('/libraries')
    const first = createApp('/read/12/34?format=pdf&mode=peek&page=6')
    await first.start()
    expect(savedLocation().path).toBe('/libraries')
    await first.router.replace('/read/12/34?format=pdf&page=6')
    first.stop()

    const reopened = createApp()
    await reopened.start()
    expect(reopened.router.currentRoute.value.fullPath).toBe('/read/12/34?format=pdf')
  })

  it('retains URL-based filters and tabs across launches', async () => {
    const first = createApp('/authors?q=Ursula&sort=name&libraryId=3')
    await first.start()
    first.stop()
    const reopened = createApp()
    await reopened.start()
    expect(reopened.router.currentRoute.value.fullPath).toBe('/authors?q=Ursula&sort=name&libraryId=3')
  })

  it.each(['/read/56/78?format=epub&cfi=target', '/libraries', '/downloads', '/book/56/files', '/?view=explicit'])(
    'honors an explicit launch at %s',
    async (path) => {
      seed('/read/12/34?format=epub')
      const app = createApp(path)
      await app.start()
      expect(app.router.currentRoute.value.fullPath).toBe(path === '/book/56/files' ? '/book/56?tab=files' : path)
    },
  )

  it('does not restore or replace the PWA record from an ordinary browser tab', async () => {
    seed('/read/12/34?format=epub')
    vi.stubGlobal('navigator', { standalone: false })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const app = createApp()
    await app.start()
    expect(app.router.currentRoute.value.path).toBe('/')
    await app.router.push('/libraries')
    expect(savedLocation().path).toBe('/read/12/34?format=epub')
    expect(app.router.currentRoute.value.path).toBe('/libraries')
  })

  it('supports installed browsers that use display-mode instead of navigator.standalone', async () => {
    seed('/libraries')
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)' }))
    const app = createApp()
    await app.start()
    expect(app.router.currentRoute.value.path).toBe('/libraries')
  })

  it('waits for sign-in before restoring the same user', async () => {
    seed('/read/12/34?format=epub')
    user.value = null
    const app = createApp()
    await app.start()
    expect(app.router.currentRoute.value.path).toBe('/login')
    expect(savedLocation().path).toBe('/read/12/34?format=epub')

    signIn()
    await app.router.replace('/')
    expect(app.router.currentRoute.value.fullPath).toBe('/read/12/34?format=epub')
  })

  it('never restores the previous account after another user signs in', async () => {
    seed('/read/12/34?format=epub')
    user.value = null
    const app = createApp()
    await app.start()
    signIn(2)
    await app.router.replace('/')
    expect(app.router.currentRoute.value.path).toBe('/')
    expect(savedLocation().userId).toBe(2)
  })

  it.each([
    { userId: 1, expected: '/read/12/34?format=epub' },
    { userId: 2, expected: '/' },
  ])('resolves a pending launch after external sign-in as user $userId', async ({ userId, expected }) => {
    seed('/read/12/34?format=epub')
    user.value = null
    const launch = createApp()
    await launch.start()
    expect(launch.router.currentRoute.value.path).toBe('/login')
    launch.stop()

    const callback = createApp('/oauth2-callback?code=secret&state=secret')
    await callback.start()
    expect(callback.router.currentRoute.value.path).toBe('/oauth2-callback')
    signIn(userId)
    await callback.router.replace('/')
    expect(callback.router.currentRoute.value.fullPath).toBe(expected)
    callback.stop()

    const laterCallback = createApp('/oauth2-callback?code=another&state=another')
    await laterCallback.start()
    await laterCallback.router.replace('/')
    expect(laterCallback.router.currentRoute.value.path).toBe('/')
  })

  it('does not restore on an unrelated authentication callback', async () => {
    seed('/libraries')
    const callback = createApp('/oauth2-callback?code=secret&state=secret')
    await callback.start()
    await callback.router.replace('/')
    expect(callback.router.currentRoute.value.path).toBe('/')
  })

  it('clears saved state on sign-out and does not save the old screen for a new account', async () => {
    const app = createApp('/read/12/34?format=epub')
    await app.start()
    user.value = null
    expect(savedLocation()).toBeNull()
    signIn(2)
    window.dispatchEvent(new Event('pagehide'))
    expect(savedLocation()).toBeNull()
    await app.router.push('/libraries')
    expect(savedLocation()).toMatchObject({ userId: 2, path: '/libraries' })
  })

  it('rechecks permissions and falls back without a redirect loop', async () => {
    seed('/settings/admin/users')
    const app = createApp()
    await app.start()
    expect(app.router.currentRoute.value.path).toBe('/')
    expect(savedLocation().path).toBe('/')
  })

  it('honors a required password change before reopening the reader', async () => {
    seed('/read/12/34?format=epub')
    user.value!.isDefaultPassword = true
    const app = createApp()
    await app.start()
    expect(app.router.currentRoute.value.path).toBe('/')
  })

  it.each([
    ['/read/12/34?format=epub', '/read/12/34?format=epub'],
    ['/libraries', '/downloads?offline=1'],
  ])('respects offline navigation when resuming %s', async (saved, expected) => {
    seed(saved)
    offlineMode.value = true
    const app = createApp()
    await app.start()
    expect(app.router.currentRoute.value.fullPath).toBe(expected)
  })

  it.each(['/magic?token=secret', '/reset-password?token=secret'])('does not save or override the public page %s', async (path) => {
    seed('/libraries')
    const app = createApp(path)
    await app.start()
    expect(app.router.currentRoute.value.fullPath).toBe(path)
    expect(savedLocation().path).toBe('/libraries')
    await app.router.replace('/')
    expect(app.router.currentRoute.value.path).toBe('/')
  })

  it('omits authentication and playback commands from saved URLs', async () => {
    const app = createApp('/book/12?tab=files&token=secret&code=secret&state=secret&redirect=%2Fmagic%3Ftoken%3Dsecret&autoplay=1#secret')
    await app.start()
    expect(savedLocation().path).toBe('/book/12?tab=files')
  })

  it.each([
    '/removed-page',
    '/login',
    '/magic?token=secret',
    '/read/12/34?mode=peek',
    'https://other.example/',
    '//other.example/',
    '/\\other.example/',
    '/'.repeat(5000),
  ])('ignores an invalid saved destination %s', async (path) => {
    seed(path)
    const app = createApp()
    await app.start()
    expect(app.router.currentRoute.value.path).toBe('/')
  })

  it.each(['broken JSON', 'null', '{"version":2,"userId":1,"path":"/libraries"}', '{"version":1,"userId":1,"path":7}'])(
    'recovers from an unreadable or incompatible record',
    async (record) => {
      localStorage.setItem(STORAGE_KEY, record)
      const app = createApp()
      await app.start()
      expect(app.router.currentRoute.value.path).toBe('/')
    },
  )

  it('keeps navigation working when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    const app = createApp()
    await app.start()
    await app.router.push('/libraries')
    user.value = null
    expect(app.router.currentRoute.value.path).toBe('/libraries')
  })

  it('ignores cancelled navigations and keeps the current screen on foreground resume', async () => {
    const app = createApp('/libraries')
    await app.start()
    app.router.beforeEach((to) => to.path !== '/authors')
    await app.router.push('/authors')
    expect(savedLocation().path).toBe('/libraries')
    seed('/read/12/34?format=epub')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(app.router.currentRoute.value.path).toBe('/libraries')
  })

  it('retries a failed save when backgrounded and removes lifecycle listeners on cleanup', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    const app = createApp('/libraries')
    await app.start()
    expect(savedLocation()).toBeNull()
    write.mockRestore()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(savedLocation().path).toBe('/libraries')
    app.stop()
    localStorage.clear()
    window.dispatchEvent(new Event('pagehide'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(savedLocation()).toBeNull()
  })
})
