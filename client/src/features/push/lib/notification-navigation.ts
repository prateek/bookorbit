import type { Router } from 'vue-router'
import { isStandaloneDisplay } from './push-support'

export function installNotificationNavigation(router: Router): () => void {
  if (!('serviceWorker' in navigator)) return () => {}

  function handleMessage(event: MessageEvent) {
    const port = event.ports[0]
    if (!port) return
    const standalone = isStandaloneDisplay()
    if (event.data?.type === 'BOOKORBIT_NOTIFICATION_PROBE') {
      port.postMessage({ standalone })
      return
    }
    if (event.data?.type !== 'BOOKORBIT_NOTIFICATION_OPEN') return
    let target: URL
    try {
      if (typeof event.data.url !== 'string' || !event.data.url) throw new Error('Missing notification destination')
      target = new URL(event.data.url, window.location.origin)
      if (target.origin !== window.location.origin || !standalone) throw new Error('Unsupported notification destination')
    } catch {
      port.postMessage({ accepted: false })
      return
    }
    port.postMessage({ accepted: true })
    void router
      .isReady()
      .then(() => router.push(target.pathname + target.search + target.hash))
      .catch(() => window.location.assign(target.href))
  }

  navigator.serviceWorker.addEventListener('message', handleMessage)
  return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
}
