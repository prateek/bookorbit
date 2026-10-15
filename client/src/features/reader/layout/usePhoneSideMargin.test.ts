import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useReaderState } from '../epub/composables/useReaderState'
import { usePhoneSideMarginRefresh } from './usePhoneSideMargin'

function renderer() {
  const attributes = new Map<string, string>()
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    setStyles: vi.fn<(css: string) => void>(),
  }
}

function sideMarginPx(target: ReturnType<typeof renderer>, width: number): number {
  return (parseFloat(target.attributes.get('gap')!) / 100) * width
}

function openReaderAt(width: number, gap: number) {
  vi.stubGlobal('innerWidth', width)
  const state = useReaderState()
  state.setGap(gap)
  const target = renderer()
  state.applyLayoutToRenderer(target)
  const reapply = vi.fn<() => void>(() => state.applyLayoutToRenderer(target))
  const scope = effectScope()
  scope.run(() => usePhoneSideMarginRefresh(() => state.gap.value, reapply))
  return { target, reapply, scope }
}

function resizeTo(width: number) {
  vi.stubGlobal('innerWidth', width)
  window.dispatchEvent(new Event('resize'))
}

describe('phone side margin after a resize', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('raises the margin when a landscape reader turns to portrait', () => {
    const { target, scope } = openReaderAt(700, 0.01)
    expect(target.attributes.get('gap')).toBe('1%')

    resizeTo(360)

    expect(sideMarginPx(target, 360)).toBeGreaterThanOrEqual(20 - 1e-9)
    scope.stop()
  })

  it('drops the floor when a portrait reader turns to landscape', () => {
    const { target, scope } = openReaderAt(393, 0)
    expect(sideMarginPx(target, 393)).toBeCloseTo(20, 5)

    resizeTo(852)

    expect(target.attributes.get('gap')).toBe('0%')
    scope.stop()
  })

  it('leaves the renderer alone when the floor does not change the margin', () => {
    const { reapply, scope } = openReaderAt(440, 0.05)

    resizeTo(420)
    resizeTo(1024)

    expect(reapply).not.toHaveBeenCalled()
    scope.stop()
  })

  it('stops listening when the reader goes away', () => {
    const { reapply, scope } = openReaderAt(700, 0.01)
    scope.stop()

    resizeTo(360)

    expect(reapply).not.toHaveBeenCalled()
  })
})
