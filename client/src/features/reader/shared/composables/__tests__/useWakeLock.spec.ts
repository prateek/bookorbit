import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { WAKE_LOCK_IDLE_MS, useWakeLock } from '../useWakeLock'

let notifyActivity: () => void = () => {}
const mounted: { unmount: () => void }[] = []

function mountWithWakeLock() {
  const wrapper = mount(
    defineComponent({
      setup() {
        ;({ notifyActivity } = useWakeLock())
        return {}
      },
      template: '<div />',
    }),
  )
  mounted.push(wrapper)
  return wrapper
}

describe('useWakeLock', () => {
  let releaseFn: ReturnType<typeof vi.fn>
  let addEventListenerSpy: ReturnType<typeof vi.fn>
  let requestFn: ReturnType<typeof vi.fn>
  let docAddEventListenerSpy: ReturnType<typeof vi.spyOn>
  let docRemoveEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.restoreAllMocks()
    releaseFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    addEventListenerSpy = vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>()
    requestFn = vi.fn<() => Promise<{ release: typeof releaseFn; addEventListener: typeof addEventListenerSpy }>>().mockResolvedValue({
      release: releaseFn,
      addEventListener: addEventListenerSpy,
    })

    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestFn },
      writable: true,
      configurable: true,
    })

    docAddEventListenerSpy = vi.spyOn(document, 'addEventListener')
    docRemoveEventListenerSpy = vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
      try {
        wrapper.unmount()
      } catch {
        // Already unmounted by the test.
      }
    }
    vi.restoreAllMocks()
  })

  it('acquires wake lock on mount', async () => {
    mountWithWakeLock()

    await vi.waitFor(() => {
      expect(requestFn).toHaveBeenCalledWith('screen')
    })
  })

  it('registers visibilitychange listener on mount', () => {
    mountWithWakeLock()

    expect(docAddEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('releases wake lock on unmount', async () => {
    const wrapper = mountWithWakeLock()
    await vi.waitFor(() => expect(requestFn).toHaveBeenCalled())

    wrapper.unmount()

    expect(releaseFn).toHaveBeenCalled()
    expect(docRemoveEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('handles missing wakeLock API gracefully', () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    expect(() => mountWithWakeLock()).not.toThrow()
  })

  it('handles rejected wake lock request gracefully', async () => {
    requestFn.mockRejectedValueOnce(new Error('Not allowed'))

    expect(() => mountWithWakeLock()).not.toThrow()
    await vi.waitFor(() => expect(requestFn).toHaveBeenCalled())
  })

  describe('idle release', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('lets the screen sleep after five minutes without interaction', async () => {
      vi.useFakeTimers()
      mountWithWakeLock()
      await vi.advanceTimersByTimeAsync(0)
      expect(requestFn).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(WAKE_LOCK_IDLE_MS - 1000)
      expect(releaseFn).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1000)
      expect(releaseFn).toHaveBeenCalledTimes(1)
    })

    it('keeps the lock while the reader keeps turning pages', async () => {
      vi.useFakeTimers()
      mountWithWakeLock()
      await vi.advanceTimersByTimeAsync(0)

      await vi.advanceTimersByTimeAsync(WAKE_LOCK_IDLE_MS - 1000)
      notifyActivity()
      await vi.advanceTimersByTimeAsync(WAKE_LOCK_IDLE_MS - 1000)

      expect(releaseFn).not.toHaveBeenCalled()
      expect(requestFn).toHaveBeenCalledTimes(1)
    })

    it('reacquires the lock on the next interaction after going idle', async () => {
      vi.useFakeTimers()
      mountWithWakeLock()
      await vi.advanceTimersByTimeAsync(WAKE_LOCK_IDLE_MS)
      expect(releaseFn).toHaveBeenCalledTimes(1)

      window.dispatchEvent(new Event('pointerdown'))
      await vi.advanceTimersByTimeAsync(0)

      expect(requestFn).toHaveBeenCalledTimes(2)
    })
  })
})
