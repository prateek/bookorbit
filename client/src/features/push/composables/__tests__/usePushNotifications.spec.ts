import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>())
vi.mock('@/lib/api', () => ({ api: (url: string, init?: RequestInit) => apiMock(url, init) }))

import { detachDevicePushSubscription, usePushNotifications } from '../usePushNotifications'

const PUBLIC_KEY = 'AQL_-w'

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }
}

function fakeSubscription(endpoint = 'https://web.push.apple.com/abc', key: number[] = [1, 2, 255, 251]) {
  return {
    endpoint,
    options: { applicationServerKey: new Uint8Array(key).buffer },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p256', auth: 'auth' } }),
    unsubscribe: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  }
}

let currentSubscription: ReturnType<typeof fakeSubscription> | null
let pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }
let requestPermission: ReturnType<typeof vi.fn>

beforeEach(() => {
  apiMock.mockReset()
  currentSubscription = null
  pushManager = {
    getSubscription: vi.fn<() => Promise<ReturnType<typeof fakeSubscription> | null>>(() => Promise.resolve(currentSubscription)),
    subscribe: vi.fn<() => Promise<ReturnType<typeof fakeSubscription>>>(() => {
      currentSubscription = fakeSubscription()
      return Promise.resolve(currentSubscription)
    }),
  }
  const registration = { pushManager }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn<() => Promise<typeof registration>>().mockResolvedValue(registration), ready: Promise.resolve(registration) },
  })
  requestPermission = vi.fn<() => Promise<NotificationPermission>>().mockResolvedValue('granted')
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', Object.assign(class {}, { permission: 'default', requestPermission }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('usePushNotifications', () => {
  it('asks for permission first, subscribes with the server key and saves the subscription', async () => {
    apiMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('vapid-public-key') ? jsonResponse({ publicKey: PUBLIC_KEY }) : jsonResponse(null, 204)),
    )
    const push = usePushNotifications()

    await expect(push.enable()).resolves.toBe('enabled')

    expect(requestPermission).toHaveBeenCalledTimes(1)
    const [{ applicationServerKey, userVisibleOnly }] = pushManager.subscribe.mock.calls[0] as [
      { applicationServerKey: Uint8Array; userVisibleOnly: boolean },
    ]
    expect(userVisibleOnly).toBe(true)
    expect([...applicationServerKey]).toEqual([1, 2, 255, 251])
    const [, init] = apiMock.mock.calls.find(([url]) => url === '/api/v1/push/subscriptions') as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p256', auth: 'auth' } })
    expect(push.subscribed.value).toBe(true)
  })

  it('stops when the user declines the permission prompt', async () => {
    requestPermission.mockResolvedValue('denied')
    const push = usePushNotifications()

    await expect(push.enable()).resolves.toBe('denied')
    expect(apiMock).not.toHaveBeenCalled()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('rolls back a fresh browser subscription when the server rejects it', async () => {
    apiMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('vapid-public-key') ? jsonResponse({ publicKey: PUBLIC_KEY }) : jsonResponse(null, 400)),
    )
    const push = usePushNotifications()

    await expect(push.enable()).resolves.toBe('failed')
    expect(currentSubscription?.unsubscribe).toHaveBeenCalled()
    expect(push.subscribed.value).toBe(false)
  })

  it('replaces a subscription that was made under a different server key', async () => {
    const stale = fakeSubscription('https://web.push.apple.com/old', [9, 9, 9])
    currentSubscription = stale
    apiMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('vapid-public-key') ? jsonResponse({ publicKey: PUBLIC_KEY }) : jsonResponse(null, 204)),
    )
    const push = usePushNotifications()

    await expect(push.enable()).resolves.toBe('enabled')
    expect(stale.unsubscribe).toHaveBeenCalled()
    expect(pushManager.subscribe).toHaveBeenCalled()
  })

  it('unsubscribes locally and tells the server to forget the endpoint', async () => {
    currentSubscription = fakeSubscription()
    const sub = currentSubscription
    apiMock.mockResolvedValue(jsonResponse(null, 204))
    const push = usePushNotifications()

    await expect(push.disable()).resolves.toBe('disabled')
    expect(sub.unsubscribe).toHaveBeenCalled()
    const [url, init] = apiMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/push/subscriptions')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: 'https://web.push.apple.com/abc' })
  })

  it('drops the device subscription on sign-out, locally and on the server', async () => {
    currentSubscription = fakeSubscription()
    const subscription = currentSubscription
    apiMock.mockResolvedValue(jsonResponse(null, 204))

    await detachDevicePushSubscription()

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    const [url, init] = apiMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/push/subscriptions')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: 'https://web.push.apple.com/abc' })
  })

  it('does not hold up sign-out when the server call hangs', async () => {
    vi.useFakeTimers()
    try {
      currentSubscription = fakeSubscription()
      apiMock.mockReturnValue(new Promise(() => {}))

      const detached = detachDevicePushSubscription()
      await vi.advanceTimersByTimeAsync(3_000)

      await expect(detached).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reflects an existing subscription on refresh and re-registers it with the server', async () => {
    currentSubscription = fakeSubscription()
    vi.stubGlobal('Notification', Object.assign(class {}, { permission: 'granted', requestPermission }))
    apiMock.mockResolvedValue(jsonResponse(null, 204))
    const push = usePushNotifications()

    await push.refresh()
    expect(push.subscribed.value).toBe(true)
    expect(apiMock).toHaveBeenCalledWith('/api/v1/push/subscriptions', expect.objectContaining({ method: 'POST' }))
  })

  it('leaves the toggle off when re-registering an existing subscription fails', async () => {
    currentSubscription = fakeSubscription()
    vi.stubGlobal('Notification', Object.assign(class {}, { permission: 'granted', requestPermission }))
    apiMock.mockResolvedValue(jsonResponse(null, 500))
    const push = usePushNotifications()

    await push.refresh()
    expect(apiMock).toHaveBeenCalledWith('/api/v1/push/subscriptions', expect.objectContaining({ method: 'POST' }))
    expect(push.subscribed.value).toBe(false)
  })

  it('reports that iPhone Safari needs the Home Screen app', () => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'serviceWorker')
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')

    const push = usePushNotifications()
    expect(push.support.value).toBe('needs-home-screen')
    expect(push.isAppleMobile).toBe(true)
    ua.mockRestore()
  })
})
