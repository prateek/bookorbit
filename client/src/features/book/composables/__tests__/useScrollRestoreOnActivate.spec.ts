import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { restoreScrollPosition, scrollEntryKey, useScrollRestoreOnActivate } from '../useScrollRestoreOnActivate'

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/series/7' }),
}))

function sizeElement(el: HTMLElement, scrollHeight: () => number, clientHeight = 500) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
}

const ScrollingView = defineComponent({
  setup() {
    const main = ref<HTMLElement | null>(null)
    useScrollRestoreOnActivate(main)
    return () => h('main', { ref: main, style: 'overflow-y: auto' })
  },
})

async function flushFrame() {
  await vi.advanceTimersByTimeAsync(20)
  await nextTick()
}

describe('restoreScrollPosition', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps scrolling as more content loads until the saved position is reachable', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    let height = 1000
    sizeElement(el, () => height)
    const done = vi.fn<() => void>()

    restoreScrollPosition(el, 3000, done)
    expect(el.scrollTop).toBe(500)
    expect(done).not.toHaveBeenCalled()

    height = 4000
    vi.advanceTimersByTime(100)

    expect(el.scrollTop).toBe(3000)
    expect(done).toHaveBeenCalledOnce()
    el.remove()
  })

  it('gives up as soon as the user touches the list', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    let height = 1000
    sizeElement(el, () => height)

    restoreScrollPosition(el, 3000)
    el.dispatchEvent(new Event('touchstart'))
    height = 4000
    vi.advanceTimersByTime(500)

    expect(el.scrollTop).toBe(500)
    el.remove()
  })
})

describe('useScrollRestoreOnActivate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState(null, '')
  })

  it('restores a re-created view to its saved position when the user comes back to the entry', async () => {
    window.history.replaceState({ position: 4, forward: '/read/12/34' }, '')
    sessionStorage.setItem(scrollEntryKey('view', '/series/7'), '2400')

    const wrapper = mount(ScrollingView, { attachTo: document.body })
    const main = wrapper.get('main').element as HTMLElement
    sizeElement(main, () => 5000)
    await flushFrame()

    expect(main.scrollTop).toBe(2400)
    wrapper.unmount()
  })

  it('starts at the top on a fresh visit to the same path', async () => {
    window.history.replaceState({ position: 4, forward: null }, '')
    sessionStorage.setItem(scrollEntryKey('view', '/series/7'), '2400')

    const wrapper = mount(ScrollingView, { attachTo: document.body })
    const main = wrapper.get('main').element as HTMLElement
    sizeElement(main, () => 5000)
    await flushFrame()

    expect(main.scrollTop).toBe(0)
    wrapper.unmount()
  })

  it('saves the position for the history entry as the user scrolls', async () => {
    window.history.replaceState({ position: 6, forward: null }, '')
    const wrapper = mount(ScrollingView, { attachTo: document.body })
    const main = wrapper.get('main').element as HTMLElement
    sizeElement(main, () => 5000)
    await flushFrame()

    main.scrollTop = 1800
    main.dispatchEvent(new Event('scroll'))
    await flushFrame()
    wrapper.unmount()

    expect(sessionStorage.getItem(scrollEntryKey('view', '/series/7'))).toBe('1800')
  })
})
