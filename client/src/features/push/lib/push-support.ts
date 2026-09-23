export type PushSupport = 'supported' | 'needs-home-screen' | 'unsupported'

/** iPadOS reports itself as a Mac, so a touch-capable "Mac" is treated as an iPad. */
export function isAppleMobileDevice(nav: Navigator = navigator): boolean {
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true
  return /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1
}

export function isStandaloneDisplay(win: Window = window): boolean {
  if ((win.navigator as Navigator & { standalone?: boolean }).standalone === true) return true
  return typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches
}

/**
 * Safari on iPhone and iPad only exposes the Push API to a web app opened from the Home Screen,
 * so a missing PushManager there means "install first", not "never".
 */
export function detectPushSupport(win: Window = window): PushSupport {
  const hasApis = 'serviceWorker' in win.navigator && 'PushManager' in win && 'Notification' in win
  if (hasApis) return 'supported'
  if (isAppleMobileDevice(win.navigator) && !isStandaloneDisplay(win)) return 'needs-home-screen'
  return 'unsupported'
}

/** VAPID keys travel as base64url; `PushManager.subscribe` wants the raw bytes. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
