import { describe, expect, it, vi } from 'vitest'
import { useFoliateInput } from '../useFoliateInput'

interface RendererState {
  flow?: 'scrolled' | 'paginated'
  atEnd?: boolean
  viewSize?: number
  end?: number
}

type DocTarget = EventTarget & Document

function makeDocTarget(): DocTarget {
  const target = new EventTarget() as DocTarget
  Object.defineProperty(target, 'defaultView', {
    configurable: true,
    value: {
      frameElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect },
      getSelection: () => null,
    },
  })
  return target
}

function touchEvent(type: string, screenY: number, ended = false): TouchEvent {
  // Scrolled flow moves the document with the finger, so client coordinates stay put.
  const touch = { clientX: 50, clientY: 50, screenX: 50, screenY }
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent
  Object.defineProperties(event, {
    touches: { value: ended ? [] : [touch] },
    changedTouches: { value: [touch] },
  })
  return event
}

function multiTouchEvent(type: string, touches: { screenY: number }[], changedTouches: { screenY: number }[]): TouchEvent {
  const asTouch = ({ screenY }: { screenY: number }) => ({ clientX: 50, clientY: 50, screenX: 50, screenY })
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent
  Object.defineProperties(event, {
    touches: { value: touches.map(asTouch) },
    changedTouches: { value: changedTouches.map(asTouch) },
  })
  return event
}

function setup(state: RendererState, canNavigate?: () => boolean) {
  const renderer = { flow: 'scrolled', atEnd: true, viewSize: 3000, end: 3000, ...state }
  const next = vi.fn<() => void>()
  const view = {
    prev: vi.fn<() => void>(),
    next,
    getBoundingClientRect: () => ({ left: 0, width: 100 }) as DOMRect,
    renderer: {
      getAttribute: (name: string) => (name === 'flow' ? renderer.flow : null),
      get atEnd() {
        return renderer.atEnd
      },
      get viewSize() {
        return renderer.viewSize
      },
      get end() {
        return renderer.end
      },
    },
  }
  const input = useFoliateInput(() => view, vi.fn<() => void>(), vi.fn<() => void>(), vi.fn<() => void>(), canNavigate)
  const doc = makeDocTarget()
  input.attachIframeClicks(doc)

  function drag(fromScreenY: number, toScreenY: number) {
    doc.dispatchEvent(touchEvent('touchstart', fromScreenY))
    doc.dispatchEvent(touchEvent('touchmove', toScreenY))
    doc.dispatchEvent(touchEvent('touchend', toScreenY, true))
  }

  return { renderer, next, input, doc, drag }
}

describe('useFoliateInput pull past the end in scrolled flow', () => {
  it('turns past the end when pulled up from the bottom of the book', () => {
    const { next, input, drag } = setup({})

    drag(400, 300)

    expect(next).toHaveBeenCalledTimes(1)
    input.cleanup()
  })

  it('does not turn when the pull starts above the bottom', () => {
    const { next, input, drag } = setup({ end: 2990 })

    drag(400, 300)

    expect(next).not.toHaveBeenCalled()
    input.cleanup()
  })

  it('does not turn when a flick only lands on the bottom', () => {
    const { renderer, next, input, doc } = setup({ end: 2000 })

    doc.dispatchEvent(touchEvent('touchstart', 400))
    renderer.end = 3000
    doc.dispatchEvent(touchEvent('touchend', 300, true))

    expect(next).not.toHaveBeenCalled()
    input.cleanup()
  })

  it('does not turn at the bottom of a section that has another after it', () => {
    const { next, input, drag } = setup({ atEnd: false })

    drag(400, 300)

    expect(next).not.toHaveBeenCalled()
    input.cleanup()
  })

  it('does not turn for a downward pull or a short one', () => {
    const { next, input, drag } = setup({})

    drag(300, 400)
    drag(400, 360)

    expect(next).not.toHaveBeenCalled()
    input.cleanup()
  })

  it('leaves paginated flow to its own swipe handling', () => {
    const { next, input, drag } = setup({ flow: 'paginated' })

    drag(400, 300)

    expect(next).not.toHaveBeenCalled()
    input.cleanup()
  })

  it('does not turn for a two-finger touch that never moves', () => {
    const { next, input, doc } = setup({})
    const lower = { screenY: 500 }
    const upper = { screenY: 300 }

    doc.dispatchEvent(multiTouchEvent('touchstart', [lower], [lower]))
    doc.dispatchEvent(multiTouchEvent('touchstart', [lower, upper], [upper]))
    doc.dispatchEvent(multiTouchEvent('touchend', [lower], [upper]))
    doc.dispatchEvent(multiTouchEvent('touchend', [], [lower]))

    expect(next).not.toHaveBeenCalled()
    input.cleanup()
  })

  it('respects the navigation lock', () => {
    const { next, input, drag } = setup({}, () => false)

    drag(400, 300)

    expect(next).not.toHaveBeenCalled()
    input.cleanup()
  })
})
