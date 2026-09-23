import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installScrollClickGuard, RECENT_SCROLL_MS } from '../scroll-click-guard'

let clock = 0
let remove: () => void
let shelf: HTMLElement
let card: HTMLButtonElement
let outside: HTMLButtonElement
let onCardClick: ReturnType<typeof vi.fn<() => void>>
let onOutsideClick: ReturnType<typeof vi.fn<() => void>>

function touchEvent(type: string, points: Array<{ x: number; y: number }>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: points.map((p) => ({ clientX: p.x, clientY: p.y })) })
  return event
}

function tap(target: Element, { moveTo, holdMs = 60 }: { moveTo?: { x: number; y: number }; holdMs?: number } = {}): MouseEvent {
  target.dispatchEvent(touchEvent('touchstart', [{ x: 50, y: 50 }]))
  if (moveTo) target.dispatchEvent(touchEvent('touchmove', [moveTo]))
  clock += holdMs
  target.dispatchEvent(touchEvent('touchend', []))
  return click(target)
}

function click(target: Element, init: MouseEventInit = { detail: 1 }): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function scroll(el: Element) {
  el.dispatchEvent(new Event('scroll'))
}

beforeEach(() => {
  clock = 1000
  document.body.innerHTML = '<div id="shelf"><button id="card"></button></div><button id="outside"></button>'
  shelf = document.getElementById('shelf')!
  card = document.getElementById('card') as HTMLButtonElement
  outside = document.getElementById('outside') as HTMLButtonElement
  onCardClick = vi.fn<() => void>()
  onOutsideClick = vi.fn<() => void>()
  card.addEventListener('click', onCardClick)
  outside.addEventListener('click', onOutsideClick)
  remove = installScrollClickGuard(window, { now: () => clock })
})

afterEach(() => {
  remove()
  document.body.innerHTML = ''
})

describe('installScrollClickGuard', () => {
  it('swallows a tap that stops a scroll in the container around it', () => {
    scroll(shelf)
    clock += 40

    const event = tap(card)

    expect(onCardClick).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('swallows a tap that lands just after a fling settles', () => {
    scroll(shelf)
    clock += RECENT_SCROLL_MS - 50

    tap(card)

    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('lets a tap through once the scroll has been still for a while', () => {
    scroll(shelf)
    clock += RECENT_SCROLL_MS + 50

    const event = tap(card)

    expect(onCardClick).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(false)
  })

  it('lets a tap through when nothing scrolled', () => {
    tap(card)

    expect(onCardClick).toHaveBeenCalledOnce()
  })

  it('only looks at containers around the tapped element', () => {
    scroll(shelf)
    clock += 40

    tap(outside)

    expect(onOutsideClick).toHaveBeenCalledOnce()
  })

  it('treats a scroll of the document as covering the whole page', () => {
    scroll(document as unknown as Element)
    clock += 40

    tap(card)

    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('ignores scrolls that start after the finger lifts', () => {
    card.addEventListener('touchend', () => {
      clock += 5
      scroll(shelf)
    })

    tap(card)

    expect(onCardClick).toHaveBeenCalledOnce()
  })

  it('swallows a touch that travelled further than a tap', () => {
    tap(card, { moveTo: { x: 50, y: 70 } })

    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('allows a little finger wobble', () => {
    tap(card, { moveTo: { x: 55, y: 58 } })

    expect(onCardClick).toHaveBeenCalledOnce()
  })

  it('does not carry a moved touch over to the next tap', () => {
    tap(card, { moveTo: { x: 50, y: 90 } })
    clock += 500

    tap(card)

    expect(onCardClick).toHaveBeenCalledOnce()
  })

  it('never touches mouse clicks, even right after a scroll', () => {
    clock += 5000
    scroll(shelf)
    clock += 10

    const event = click(card, { detail: 1 })

    expect(onCardClick).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(false)
  })

  it('honours a mouse pointerType even straight after a touch', () => {
    scroll(shelf)
    tap(outside)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
    Object.defineProperty(event, 'pointerType', { value: 'mouse' })

    card.dispatchEvent(event)

    expect(onCardClick).toHaveBeenCalledOnce()
  })

  it('never touches keyboard activation', () => {
    scroll(shelf)
    card.dispatchEvent(touchEvent('touchstart', [{ x: 0, y: 0 }]))
    card.dispatchEvent(touchEvent('touchend', []))

    click(card, { detail: 0 })

    expect(onCardClick).toHaveBeenCalledOnce()
  })

  it('stops guarding once removed', () => {
    remove()
    scroll(shelf)

    tap(card)

    expect(onCardClick).toHaveBeenCalledOnce()
    remove = () => {}
  })
})
