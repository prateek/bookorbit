import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { installNotificationNavigation } from '../notification-navigation'

const workers = new EventTarget()
let uninstall = () => {}

function message(data: unknown) {
  const port = { postMessage: vi.fn<(data: unknown) => void>() }
  workers.dispatchEvent(new MessageEvent('message', { data, ports: [port as unknown as MessagePort] }))
  return port.postMessage
}

async function routerAt(path = '/read/1/10') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/read/:book/:file', component: {} },
      { path: '/new-arrivals/:token', component: {} },
      { path: '/login', component: {} },
    ],
  })
  await router.push(path)
  uninstall = installNotificationNavigation(router)
  return router
}

beforeEach(() => {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: workers })
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
})
afterEach(() => {
  uninstall()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(navigator, 'standalone')
})

describe('notification navigation', () => {
  it('identifies an installed app', async () => {
    await routerAt()
    expect(message({ type: 'BOOKORBIT_NOTIFICATION_PROBE' })).toHaveBeenCalledWith({ standalone: true })
  })

  it('acknowledges promptly while awaiting progress-saving navigation guards', async () => {
    const router = await routerAt()
    let saved!: () => void
    const pendingSave = new Promise<void>((resolve) => {
      saved = resolve
    })
    router.beforeEach(() => pendingSave)
    const reply = message({ type: 'BOOKORBIT_NOTIFICATION_OPEN', url: `${location.origin}/new-arrivals/batch` })
    expect(reply).toHaveBeenCalledWith({ accepted: true })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/read/1/10'))
    saved()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/new-arrivals/batch'))
  })

  it('keeps the target through a login redirect', async () => {
    const router = await routerAt()
    router.beforeEach((to) => (to.path !== '/login' ? { path: '/login', query: { redirect: to.fullPath } } : true))
    message({ type: 'BOOKORBIT_NOTIFICATION_OPEN', url: '/read/2/20?format=epub' })
    await vi.waitFor(() => expect(router.currentRoute.value.query.redirect).toBe('/read/2/20?format=epub'))
  })

  it('rejects external destinations and ordinary browser tabs', async () => {
    const router = await routerAt()
    expect(message({ type: 'BOOKORBIT_NOTIFICATION_OPEN', url: 'https://elsewhere.invalid/read/2/20' })).toHaveBeenCalledWith({ accepted: false })
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
    expect(message({ type: 'BOOKORBIT_NOTIFICATION_PROBE' })).toHaveBeenCalledWith({ standalone: false })
    expect(message({ type: 'BOOKORBIT_NOTIFICATION_OPEN', url: '/read/2/20' })).toHaveBeenCalledWith({ accepted: false })
    expect(router.currentRoute.value.path).toBe('/read/1/10')
  })
})
