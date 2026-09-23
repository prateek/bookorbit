import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useVisibility } from '../useVisibility'

function mountVisibility() {
  let visibility!: ReturnType<typeof useVisibility>
  const wrapper = mount(
    defineComponent({
      setup() {
        visibility = useVisibility()
        return () => h('div')
      },
    }),
  )

  return { visibility, wrapper }
}

function stubTouchScreen(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: matches && query.includes('pointer: coarse'), media: query }),
  })
}

describe('useVisibility', () => {
  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(window, 'matchMedia')
    document.body.innerHTML = ''
  })

  it('temporarily reveals unpinned controls from a middle tap', async () => {
    vi.useFakeTimers()
    const { visibility, wrapper } = mountVisibility()

    visibility.handleMiddleTap()

    expect(visibility.isPinned.value).toBe(false)
    expect(visibility.headerVisible.value).toBe(true)
    expect(visibility.footerVisible.value).toBe(true)

    await vi.advanceTimersByTimeAsync(3000)

    expect(visibility.headerVisible.value).toBe(false)
    expect(visibility.footerVisible.value).toBe(false)
    wrapper.unmount()
  })

  it('hides temporarily visible controls on the next middle tap', () => {
    vi.useFakeTimers()
    const { visibility, wrapper } = mountVisibility()

    visibility.handleMiddleTap()
    visibility.handleMiddleTap()

    expect(visibility.isPinned.value).toBe(false)
    expect(visibility.headerVisible.value).toBe(false)
    expect(visibility.footerVisible.value).toBe(false)
    wrapper.unmount()
  })

  it('keeps pinned controls visible until explicitly unpinned', async () => {
    vi.useFakeTimers()
    const { visibility, wrapper } = mountVisibility()

    visibility.handleMiddleTap()
    visibility.togglePinned()
    await vi.advanceTimersByTimeAsync(3000)

    expect(visibility.isPinned.value).toBe(true)
    expect(visibility.headerVisible.value).toBe(true)
    expect(visibility.footerVisible.value).toBe(true)

    visibility.handleMiddleTap()
    expect(visibility.headerVisible.value).toBe(true)
    expect(visibility.footerVisible.value).toBe(true)

    visibility.togglePinned()
    expect(visibility.isPinned.value).toBe(false)
    expect(visibility.headerVisible.value).toBe(true)
    expect(visibility.footerVisible.value).toBe(true)

    await vi.advanceTimersByTimeAsync(3000)
    expect(visibility.headerVisible.value).toBe(false)
    expect(visibility.footerVisible.value).toBe(false)
    wrapper.unmount()
  })

  it('keeps controls up on a touch screen until the next tap', async () => {
    vi.useFakeTimers()
    stubTouchScreen(true)
    const { visibility, wrapper } = mountVisibility()

    visibility.handleMiddleTap()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(visibility.headerVisible.value).toBe(true)
    expect(visibility.footerVisible.value).toBe(true)

    visibility.handleMiddleTap()
    expect(visibility.headerVisible.value).toBe(false)
    expect(visibility.footerVisible.value).toBe(false)
    wrapper.unmount()
  })

  it('pauses auto-hide while the reader bars are being used', async () => {
    vi.useFakeTimers()
    const { visibility, wrapper } = mountVisibility()
    const footer = document.createElement('footer')
    footer.setAttribute('data-reader-chrome', '')
    const slider = document.createElement('input')
    footer.appendChild(slider)
    document.body.appendChild(footer)

    visibility.handleMiddleTap()
    slider.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(visibility.footerVisible.value).toBe(true)

    slider.dispatchEvent(new Event('pointerup', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(2_999)
    expect(visibility.footerVisible.value).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(visibility.footerVisible.value).toBe(false)
    wrapper.unmount()
  })

  it('ignores pointer activity outside the reader bars', async () => {
    vi.useFakeTimers()
    const { visibility, wrapper } = mountVisibility()
    const page = document.createElement('div')
    document.body.appendChild(page)

    visibility.handleMiddleTap()
    page.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(3000)

    expect(visibility.headerVisible.value).toBe(false)
    wrapper.unmount()
  })
})
