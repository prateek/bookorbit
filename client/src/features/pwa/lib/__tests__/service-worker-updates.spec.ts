import { afterEach, describe, expect, it, vi } from 'vitest'
import { installServiceWorkerUpdateChecks } from '../service-worker-updates'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('installServiceWorkerUpdateChecks', () => {
  it('looks for a new build when the app returns to the foreground, at most every half hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const update = vi.fn<() => Promise<void>>().mockResolvedValue()
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<() => Promise<{ update: typeof update }>>().mockResolvedValue({ update }) },
    })

    installServiceWorkerUpdateChecks()
    setVisibility('visible')
    await Promise.resolve()
    expect(update).not.toHaveBeenCalled()

    vi.setSystemTime(Date.now() + 31 * 60 * 1000)
    setVisibility('hidden')
    setVisibility('visible')
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))

    setVisibility('visible')
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)
  })
})
