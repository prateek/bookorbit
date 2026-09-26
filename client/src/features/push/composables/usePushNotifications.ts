import { ref } from 'vue'
import { api } from '@/lib/api'
import { detectPushSupport, isAppleMobileDevice, urlBase64ToUint8Array, type PushSupport } from '../lib/push-support'

export type PushToggleResult = 'enabled' | 'disabled' | 'denied' | 'failed'

const SERVICE_WORKER_READY_TIMEOUT_MS = 10_000

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS)
  })
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** A subscription made under an older server key would be rejected by the push service, so it is replaced. */
function sameKey(current: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!current) return true
  const bytes = new Uint8Array(current)
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index])
}

async function fetchPublicKey(): Promise<string> {
  const res = await api('/api/v1/push/vapid-public-key')
  if (!res.ok) throw new Error(`vapid key request failed: ${res.status}`)
  const body = (await res.json()) as { publicKey?: unknown }
  if (typeof body.publicKey !== 'string' || !body.publicKey) throw new Error('vapid key missing')
  return body.publicKey
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  const res = await api('/api/v1/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } }),
  })
  if (!res.ok) throw new Error(`push subscription save failed: ${res.status}`)
}

async function removeSubscription(endpoint: string): Promise<void> {
  const res = await api('/api/v1/push/subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!res.ok) throw new Error(`push subscription removal failed: ${res.status}`)
}

const DETACH_TIMEOUT_MS = 3_000

/**
 * Drops this browser's push subscription on sign-out, on the device and on the server, so a shared
 * device neither keeps receiving the previous account's pushes nor hands them to the next account.
 * Bounded so a slow network cannot hold up sign-out.
 */
export async function detachDevicePushSubscription(): Promise<void> {
  if (detectPushSupport() !== 'supported') return
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, DETACH_TIMEOUT_MS)
  })
  const detach = (async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    const { endpoint } = subscription
    await Promise.allSettled([removeSubscription(endpoint), subscription.unsubscribe()])
  })().catch(() => {})
  try {
    await Promise.race([detach, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Re-registers this device's subscription with the server at launch. The push service can replace
 * a subscription at any time, and the service worker cannot always report the new one itself.
 */
export async function reconcilePushSubscription(): Promise<void> {
  if (detectPushSupport() !== 'supported' || Notification.permission !== 'granted') return
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined)
  const subscription = await registration?.pushManager.getSubscription().catch(() => null)
  if (subscription) await saveSubscription(subscription).catch(() => {})
}

export function usePushNotifications() {
  const support = ref<PushSupport>(detectPushSupport())
  const isAppleMobile = isAppleMobileDevice()
  const permission = ref<NotificationPermission>(support.value === 'supported' ? Notification.permission : 'default')
  const subscribed = ref(false)
  const busy = ref(false)

  /** Reads this device's state and re-registers an existing subscription, so the server copy heals after a sign-in switch. */
  async function refresh(): Promise<void> {
    if (support.value !== 'supported') return
    permission.value = Notification.permission
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      const active = !!subscription && permission.value === 'granted'
      if (subscription && active) await saveSubscription(subscription)
      subscribed.value = active
    } catch {
      // The server may not hold this device's subscription, so offer to enable it again.
      subscribed.value = false
    }
  }

  /** Must be called straight from the tap handler: iOS only shows the permission prompt inside a user gesture. */
  async function enable(): Promise<PushToggleResult> {
    if (support.value !== 'supported' || busy.value) return 'failed'
    busy.value = true
    try {
      permission.value = await Notification.requestPermission()
      if (permission.value !== 'granted') return 'denied'

      const [publicKey, registration] = await Promise.all([fetchPublicKey(), readyRegistration()])
      if (!registration) return 'failed'
      const applicationServerKey = urlBase64ToUint8Array(publicKey)
      let existing = await registration.pushManager.getSubscription()
      if (existing && !sameKey(existing.options?.applicationServerKey ?? null, applicationServerKey)) {
        await existing.unsubscribe()
        existing = null
      }
      const subscription = existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }))
      try {
        await saveSubscription(subscription)
      } catch (error) {
        if (!existing) await subscription.unsubscribe().catch(() => false)
        throw error
      }
      subscribed.value = true
      return 'enabled'
    } catch {
      return 'failed'
    } finally {
      busy.value = false
    }
  }

  async function disable(): Promise<PushToggleResult> {
    if (support.value !== 'supported' || busy.value) return 'failed'
    busy.value = true
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const { endpoint } = subscription
        await subscription.unsubscribe()
        await removeSubscription(endpoint).catch(() => {})
      }
      subscribed.value = false
      return 'disabled'
    } catch {
      return 'failed'
    } finally {
      busy.value = false
    }
  }

  return { support, isAppleMobile, permission, subscribed, busy, refresh, enable, disable }
}
