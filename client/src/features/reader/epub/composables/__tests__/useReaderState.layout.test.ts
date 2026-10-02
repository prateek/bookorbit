import { describe, expect, it, vi } from 'vitest'
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

describe('reader layout across reading modes', () => {
  it('uses compact page bands and chapter-end padding', () => {
    const state = useReaderState()
    const target = renderer()

    state.applyToRenderer(target)
    expect(target.attributes.get('margin')).toBe('28px')

    state.setFlow('scrolled')
    state.applyToRenderer(target)
    expect(target.attributes.get('margin')).toBe('24px')
  })

  it('keeps the selected font and horizontal inset when switching flow', () => {
    const state = useReaderState()
    const target = renderer()
    state.setFontSize(17)
    state.setLineHeight(1.6)
    state.setGap(0.06)

    state.applyToRenderer(target)
    const pageCss = target.setStyles.mock.calls.at(-1)?.[0]
    expect(target.attributes.get('gap')).toBe('6%')

    state.setFlow('scrolled')
    state.applyToRenderer(target)
    expect(parseFloat(target.attributes.get('gap')!)).toBeCloseTo(5.660377, 5)
    expect(target.setStyles.mock.calls.at(-1)?.[0]).toBe(pageCss)
    expect(state.fontSize.value).toBe(17)
    expect(state.gap.value).toBe(0.06)
  })

  it('uses selected vertical spacing and frees the bands when information is hidden', () => {
    const state = useReaderState()
    const target = renderer()
    state.setVerticalMargin(0)
    state.applyToRenderer(target)
    expect(target.attributes.get('margin')).toBe('28px')
    state.setInformationDisplay('hidden')
    state.applyToRenderer(target)
    expect(target.attributes.get('margin')).toBe('0px')
    state.setVerticalMargin(12)
    state.setInformationDisplay('progress')
    state.applyToRenderer(target)
    expect(target.attributes.get('margin')).toBe('12px')
    state.setFlow('scrolled')
    state.applyToRenderer(target)
    expect(target.attributes.get('margin')).toBe('12px')
    state.setVerticalMargin(200)
    expect(state.verticalMargin.value).toBe(80)
  })

  it('updates layout without injecting publisher-style overrides', () => {
    const state = useReaderState()
    const target = renderer()
    state.setInformationDisplay('hidden')
    state.applyLayoutToRenderer(target)
    expect(target.setStyles).not.toHaveBeenCalled()
  })

  it('disables automatic text inflation inside the EPUB document', () => {
    const state = useReaderState()
    const css = state.generateCSS()

    expect(css).toContain('-webkit-text-size-adjust: 100%;')
    expect(css).toContain('text-size-adjust: 100%;')
  })
})
