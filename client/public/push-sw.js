/* Loaded into the generated Workbox service worker through `workbox.importScripts`. */

function sameOriginUrl(raw) {
  try {
    const url = new URL(typeof raw === 'string' && raw ? raw : '/', self.location.origin)
    return url.origin === self.location.origin ? url.href : new URL('/', self.location.origin).href
  } catch {
    return new URL('/', self.location.origin).href
  }
}

function readPayload(event) {
  if (!event.data) return {}
  try {
    return event.data.json() || {}
  } catch {
    return { body: event.data.text() }
  }
}

/** The badge mirrors the notifications still waiting in the notification centre. */
async function syncAppBadge() {
  if (!('setAppBadge' in self.navigator)) return
  try {
    const open = await self.registration.getNotifications()
    if (open.length > 0) await self.navigator.setAppBadge(open.length)
    else await self.navigator.clearAppBadge()
  } catch {
    // Badging is cosmetic; never fail the push over it.
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event)
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'BookOrbit'
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    data: { url: sameOriginUrl(payload.url) },
  }
  if (typeof payload.tag === 'string' && payload.tag) options.tag = payload.tag

  event.waitUntil(self.registration.showNotification(title, options).then(syncAppBadge))
})

function askWindow(client, message) {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => finish(null), 250)
    function finish(value) {
      clearTimeout(timer)
      channel.port1.close()
      resolve(value)
    }
    channel.port1.onmessage = (event) => finish(event.data)
    try {
      client.postMessage(message, [channel.port2])
    } catch {
      finish(null)
    }
  })
}

function findAppWindow(candidates) {
  return new Promise((resolve) => {
    let remaining = candidates.length
    if (!remaining) resolve(null)
    for (const client of candidates) {
      askWindow(client, { type: 'BOOKORBIT_NOTIFICATION_PROBE' }).then((reply) => {
        if (reply && reply.standalone === true) resolve(client)
        if (--remaining === 0) resolve(null)
      })
    }
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = sameOriginUrl(event.notification.data && event.notification.data.url)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const candidates = windows.filter((client) => new URL(client.url).origin === self.location.origin)
      const existing = await findAppWindow(candidates)
      if (existing) {
        try {
          await existing.focus()
          const accepted = await askWindow(existing, { type: 'BOOKORBIT_NOTIFICATION_OPEN', url: target })
          if (!accepted || accepted.accepted !== true) await existing.navigate(target)
        } catch {
          await self.clients.openWindow(target)
        }
      } else {
        await self.clients.openWindow(target)
      }
      await syncAppBadge()
    })(),
  )
})

/**
 * The push service rotated this device's subscription. Subscribe again with the same server key and
 * register the new endpoint; the request rides on the session cookie. If that session has expired
 * the app registers the endpoint itself at its next launch.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey
      const subscription =
        event.newSubscription ||
        (applicationServerKey ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }) : null)
      if (!subscription) return
      const json = subscription.toJSON()
      await fetch('/api/v1/push/subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys && json.keys.p256dh, auth: json.keys && json.keys.auth } }),
      })
    })().catch(() => {}),
  )
})

self.addEventListener('notificationclose', (event) => {
  event.waitUntil(syncAppBadge())
})

/** Opening the app from the Home Screen is a navigation; treat it as the user having seen what is new. */
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || !('clearAppBadge' in self.navigator)) return
  self.navigator.clearAppBadge().catch(() => {})
})
