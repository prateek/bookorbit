import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { KeepAlive, defineComponent, h, nextTick, ref } from 'vue'

import { APP_RESUMED_EVENT, APP_RESUME_THRESHOLD_MS, onAppResumed, useAppResumeWatcher } from '../useAppResume'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useAppResumeWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  function mountWatcher() {
    const resumed = vi.fn<(event: Event) => void>()
    window.addEventListener(APP_RESUMED_EVENT, resumed)
    const wrapper = mount(
      defineComponent({
        setup() {
          useAppResumeWatcher()
          return () => null
        },
      }),
    )
    return {
      resumed,
      cleanup: () => {
        wrapper.unmount()
        window.removeEventListener(APP_RESUMED_EVENT, resumed)
      },
    }
  }

  it('announces a resume after the app was hidden past the threshold', () => {
    const { resumed, cleanup } = mountWatcher()

    setVisibility('hidden')
    vi.advanceTimersByTime(APP_RESUME_THRESHOLD_MS + 1)
    setVisibility('visible')

    expect(resumed).toHaveBeenCalledOnce()
    cleanup()
  })

  it('stays quiet for a quick app switch', () => {
    const { resumed, cleanup } = mountWatcher()

    setVisibility('hidden')
    vi.advanceTimersByTime(30_000)
    setVisibility('visible')

    expect(resumed).not.toHaveBeenCalled()
    cleanup()
  })
})

describe('onAppResumed', () => {
  function resume() {
    window.dispatchEvent(new CustomEvent(APP_RESUMED_EVENT))
  }

  it('runs the callback while the view is mounted and stops after unmount', () => {
    const callback = vi.fn<() => void>()
    const wrapper = mount(
      defineComponent({
        setup() {
          onAppResumed(callback)
          return () => null
        },
      }),
    )

    resume()
    expect(callback).toHaveBeenCalledOnce()

    wrapper.unmount()
    resume()
    expect(callback).toHaveBeenCalledOnce()
  })

  it('defers a kept-alive view until it is shown again, and runs it once', async () => {
    const callback = vi.fn<() => void>()
    const Cached = defineComponent({
      name: 'CachedView',
      setup() {
        onAppResumed(callback)
        return () => h('div', 'cached')
      },
    })
    const Other = defineComponent({ name: 'OtherView', render: () => h('div', 'other') })
    const showCached = ref(true)
    mount(
      defineComponent({
        setup() {
          return () => h(KeepAlive, null, [showCached.value ? h(Cached) : h(Other)])
        },
      }),
    )

    showCached.value = false
    await nextTick()
    resume()
    resume()
    expect(callback).not.toHaveBeenCalled()

    showCached.value = true
    await nextTick()
    expect(callback).toHaveBeenCalledOnce()
  })
})
