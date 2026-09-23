import { describe, expect, it } from 'vitest'

import { detectPushSupport, isAppleMobileDevice, urlBase64ToUint8Array } from '../push-support'

function fakeWindow(options: { userAgent: string; maxTouchPoints?: number; standalone?: boolean; push?: boolean }): Window {
  const navigator = {
    userAgent: options.userAgent,
    maxTouchPoints: options.maxTouchPoints ?? 0,
    standalone: options.standalone,
    ...(options.push ? { serviceWorker: {} } : {}),
  }
  return {
    navigator,
    matchMedia: () => ({ matches: options.standalone === true }),
    ...(options.push ? { PushManager: class {}, Notification: class {} } : {}),
  } as unknown as Window
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'

describe('detectPushSupport', () => {
  it('reports support whenever the Push API is present', () => {
    expect(detectPushSupport(fakeWindow({ userAgent: IPHONE_UA, standalone: true, push: true }))).toBe('supported')
  })

  it('asks iPhone Safari users to open the Home Screen app first', () => {
    expect(detectPushSupport(fakeWindow({ userAgent: IPHONE_UA }))).toBe('needs-home-screen')
  })

  it('treats a touch-capable Mac user agent as an iPad', () => {
    expect(isAppleMobileDevice(fakeWindow({ userAgent: IPAD_UA, maxTouchPoints: 5 }).navigator)).toBe(true)
    expect(isAppleMobileDevice(fakeWindow({ userAgent: IPAD_UA }).navigator)).toBe(false)
  })

  it('reports other browsers without the Push API as unsupported', () => {
    expect(detectPushSupport(fakeWindow({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }))).toBe('unsupported')
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes unpadded base64url into bytes', () => {
    expect([...urlBase64ToUint8Array('AQL_-w')]).toEqual([1, 2, 255, 251])
  })
})
