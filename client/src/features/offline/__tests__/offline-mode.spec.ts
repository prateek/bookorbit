import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { offlineMode, registerOfflineGuard } from '../offline-mode'

const Page = { template: '<div />' }

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: Page },
      { path: '/downloads', name: 'downloads', component: Page, meta: { offlineCapable: true } },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Page, meta: { offlineCapable: true } },
      { path: '/login', name: 'login', component: Page, meta: { public: true } },
    ],
  })
  registerOfflineGuard(router)
  return router
}

afterEach(() => {
  offlineMode.value = false
})

describe('offline mode navigation', () => {
  it('sends a launch without the server to downloads, and lets the reader open', async () => {
    offlineMode.value = true
    const router = makeRouter()

    await router.push('/')
    expect(router.currentRoute.value.name).toBe('downloads')
    expect(router.currentRoute.value.query.offline).toBe('1')

    await router.push('/read/3/9?format=epub')
    expect(router.currentRoute.value.name).toBe('reader')
  })

  it('leaves navigation alone when the server was reachable', async () => {
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('dashboard')
  })
})
