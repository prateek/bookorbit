import { describe, expect, it, vi } from 'vitest'

import { installAppBadgeClearing } from '../app-badge'

describe('installAppBadgeClearing', () => {
  it('clears the badge now and whenever the app becomes visible again', () => {
    const clearAppBadge = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const nav = { clearAppBadge } as unknown as Navigator
    let visibility: DocumentVisibilityState = 'visible'
    const doc = document
    const spy = vi.spyOn(doc, 'visibilityState', 'get').mockImplementation(() => visibility)

    const uninstall = installAppBadgeClearing(doc, nav)
    expect(clearAppBadge).toHaveBeenCalledTimes(1)

    visibility = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(clearAppBadge).toHaveBeenCalledTimes(1)

    visibility = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(clearAppBadge).toHaveBeenCalledTimes(2)

    uninstall()
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(clearAppBadge).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('does nothing where the Badging API is missing', () => {
    expect(() => installAppBadgeClearing(document, {} as Navigator)()).not.toThrow()
  })
})
