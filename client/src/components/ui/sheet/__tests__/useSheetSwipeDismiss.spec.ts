import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSheetSwipeDismiss } from '../useSheetSwipeDismiss'

function touchEvent(sheet: HTMLElement, target: Element, x: number, y: number) {
  return {
    touches: [{ clientX: x, clientY: y }],
    currentTarget: sheet,
    target,
    cancelable: true,
    preventDefault: vi.fn<() => void>(),
  } as unknown as TouchEvent
}

function setup(enabled = true) {
  const sheet = document.createElement('div')
  const body = document.createElement('div')
  const row = document.createElement('button')
  body.appendChild(row)
  sheet.appendChild(body)
  document.body.appendChild(sheet)
  Object.defineProperty(sheet, 'offsetHeight', { configurable: true, value: 400 })
  const dismiss = vi.fn<() => void>()
  const swipe = useSheetSwipeDismiss({ enabled: () => enabled, dismiss })
  return { sheet, body, row, dismiss, swipe }
}

function drag(swipe: ReturnType<typeof useSheetSwipeDismiss>, sheet: HTMLElement, target: Element, distance: number, steps = 4) {
  swipe.handleTouchStart(touchEvent(sheet, target, 100, 100))
  for (let step = 1; step <= steps; step += 1) {
    swipe.handleTouchMove(touchEvent(sheet, target, 100, 100 + (distance * step) / steps))
  }
  swipe.handleTouchEnd()
}

describe('useSheetSwipeDismiss', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  it('follows the finger and dismisses after a long downward drag', () => {
    const { sheet, row, dismiss, swipe } = setup()
    vi.mocked(performance.now).mockReturnValueOnce(0).mockReturnValue(1000)

    swipe.handleTouchStart(touchEvent(sheet, row, 100, 100))
    swipe.handleTouchMove(touchEvent(sheet, row, 100, 160))
    expect(sheet.style.transform).toBe('translate3d(0, 60px, 0)')
    swipe.handleTouchMove(touchEvent(sheet, row, 100, 260))
    swipe.handleTouchEnd()

    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('snaps back after a short, slow drag', () => {
    const { sheet, row, dismiss, swipe } = setup()
    vi.mocked(performance.now).mockReturnValueOnce(0).mockReturnValue(1000)

    drag(swipe, sheet, row, 50)

    expect(dismiss).not.toHaveBeenCalled()
    expect(sheet.style.transform).toBe('')
  })

  it('leaves upward drags to the content', () => {
    const { sheet, row, dismiss, swipe } = setup()

    drag(swipe, sheet, row, -200)

    expect(dismiss).not.toHaveBeenCalled()
    expect(sheet.style.transform).toBe('')
  })

  it('does not steal the gesture while the content under the finger is scrolled', () => {
    const { sheet, body, row, dismiss, swipe } = setup()
    body.scrollTop = 120

    drag(swipe, sheet, row, 300)

    expect(dismiss).not.toHaveBeenCalled()
  })

  it('snaps back without dismissing when the browser cancels a long drag', () => {
    const { sheet, row, dismiss, swipe } = setup()
    vi.mocked(performance.now).mockReturnValueOnce(0).mockReturnValue(50)

    swipe.handleTouchStart(touchEvent(sheet, row, 100, 100))
    swipe.handleTouchMove(touchEvent(sheet, row, 100, 400))
    expect(sheet.style.transform).toBe('translate3d(0, 300px, 0)')
    swipe.handleTouchCancel()

    expect(dismiss).not.toHaveBeenCalled()
    expect(sheet.style.transform).toBe('')

    swipe.handleTouchEnd()
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('does nothing for sheets that are not bottom sheets', () => {
    const { sheet, row, dismiss, swipe } = setup(false)

    drag(swipe, sheet, row, 300)

    expect(dismiss).not.toHaveBeenCalled()
    expect(sheet.style.transform).toBe('')
  })
})
