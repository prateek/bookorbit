import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReaderState } from '../useReaderState'

function renderer() {
  const attributes = new Map<string, string>()
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    setStyles: vi.fn<(css: string) => void>(),
  }
}

// Foliate pads each side by gap * width in paginated flow; scrolled flow receives gap / (1 + gap).
function sideMarginPx(target: ReturnType<typeof renderer>, width: number, flow: 'paginated' | 'scrolled'): number {
  const sent = parseFloat(target.attributes.get('gap')!) / 100
  const gap = flow === 'scrolled' ? sent / (1 - sent) : sent
  return gap * width
}

function layoutAt(width: number, setup: (state: ReturnType<typeof useReaderState>) => void = () => {}) {
  vi.stubGlobal('innerWidth', width)
  const state = useReaderState()
  setup(state)
  const target = renderer()
  state.applyToRenderer(target)
  return { state, target }
}

describe('reader side margins on phones', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps at least 20px a side on a narrow phone at the default setting', () => {
    const { target } = layoutAt(360)
    expect(sideMarginPx(target, 360, 'paginated')).toBeCloseTo(20, 5)
  })

  it('leaves the default alone when it already clears 20px', () => {
    const { target } = layoutAt(440)
    expect(target.attributes.get('gap')).toBe('5%')
    expect(sideMarginPx(target, 440, 'paginated')).toBeCloseTo(22, 5)
  })

  it('raises a low side margin setting to 20px on a phone without changing the setting', () => {
    const { state, target } = layoutAt(440, (s) => s.setGap(0.02))
    expect(sideMarginPx(target, 440, 'paginated')).toBeCloseTo(20, 5)
    expect(state.gap.value).toBe(0.02)
  })

  it('applies the same floor in scrolled flow', () => {
    const { target } = layoutAt(360, (s) => {
      s.setGap(0)
      s.setFlow('scrolled')
    })
    expect(sideMarginPx(target, 360, 'scrolled')).toBeCloseTo(20, 5)
  })

  it('honours a low setting from 600px up', () => {
    const { target } = layoutAt(600, (s) => s.setGap(0.02))
    expect(target.attributes.get('gap')).toBe('2%')
  })
})
