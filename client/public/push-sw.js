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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = sameOriginUrl(event.notification.data && event.notification.data.url)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (existing) {
        try {
          const focused = await existing.focus()
          await (focused || existing).navigate(target)
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

self.addEventListener('notificationclose', (event) => {
  event.waitUntil(syncAppBadge())
})

/** Opening the app from the Home Screen is a navigation; treat it as the user having seen what is new. */
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || !('clearAppBadge' in self.navigator)) return
  self.navigator.clearAppBadge().catch(() => {})
})
