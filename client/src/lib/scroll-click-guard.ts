export const RECENT_SCROLL_MS = 300
export const TAP_MOVE_TOLERANCE_PX = 10
const TOUCH_CLICK_WINDOW_MS = 1000

interface ScrollClickGuardOptions {
  now?: () => number
}

/**
 * iOS WebKit delivers a click when a finger lands to stop a momentum scroll inside an overflow
 * container, and a tap at the end of a fling lands on whatever slid under the finger. For clicks
 * that come from touch, this swallows the click when a container around the target scrolled while
 * the finger was down or just before it landed, or when the finger travelled further than a tap.
 * Mouse and pen clicks and keyboard activation always pass. Returns a function that removes it.
 */
export function installScrollClickGuard(win: Window = window, options: ScrollClickGuardOptions = {}): () => void {
  const now = options.now ?? (() => win.performance.now())
  const doc = win.document
  const lastScrollAt = new WeakMap<Node, number>()

  let touchStartAt = Number.NEGATIVE_INFINITY
  let touchEndAt = Number.NEGATIVE_INFINITY
  let touchDown = false
  let startX = 0
  let startY = 0
  let touchMoved = false

  function handleScroll(event: Event) {
    const target = event.target
    const node = target === doc ? doc.documentElement : target
    if (node instanceof Node) lastScrollAt.set(node, now())
  }

  function handleTouchStart(event: TouchEvent) {
    touchStartAt = now()
    touchDown = true
    const touch = event.touches[0]
    touchMoved = event.touches.length > 1 || !touch
    if (touch) {
      startX = touch.clientX
      startY = touch.clientY
    }
  }

  function handleTouchMove(event: TouchEvent) {
    if (touchMoved) return
    const touch = event.touches[0]
    if (!touch || event.touches.length > 1) {
      touchMoved = true
      return
    }
    if (Math.abs(touch.clientX - startX) > TAP_MOVE_TOLERANCE_PX || Math.abs(touch.clientY - startY) > TAP_MOVE_TOLERANCE_PX) {
      touchMoved = true
    }
  }

  function handleTouchEnd(event: TouchEvent) {
    if (event.touches.length > 0) return
    touchDown = false
    touchEndAt = now()
  }

  function isTouchClick(event: MouseEvent): boolean {
    // Keyboard activation and element.click() report no click count.
    if (event.detail === 0) return false
    const pointerType = (event as Partial<PointerEvent>).pointerType
    if (pointerType === 'mouse' || pointerType === 'pen') return false
    if (pointerType === 'touch') return true
    return touchDown || now() - touchEndAt < TOUCH_CLICK_WINDOW_MS
  }

  function scrolledUnderTouch(target: Node, at: number): boolean {
    const hasTouch = touchStartAt > Number.NEGATIVE_INFINITY
    const from = (hasTouch ? touchStartAt : at) - RECENT_SCROLL_MS
    // Scrolls after the finger lifted come from the tap itself (focus pulling a field into view).
    const until = hasTouch && !touchDown && touchEndAt >= touchStartAt ? touchEndAt : at
    for (let node: Node | null = target; node; node = node.parentNode) {
      const scrolledAt = lastScrollAt.get(node)
      if (scrolledAt !== undefined && scrolledAt >= from && scrolledAt <= until) return true
    }
    return false
  }

  function handleClick(event: MouseEvent) {
    if (!isTouchClick(event)) return
    const target = event.target
    if (!(target instanceof Node)) return
    const moved = touchMoved
    touchMoved = false
    if (!moved && !scrolledUnderTouch(target, now())) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  const capture = { capture: true } as const
  const passiveCapture = { capture: true, passive: true } as const
  win.addEventListener('scroll', handleScroll, passiveCapture)
  win.addEventListener('touchstart', handleTouchStart, passiveCapture)
  win.addEventListener('touchmove', handleTouchMove, passiveCapture)
  win.addEventListener('touchend', handleTouchEnd, passiveCapture)
  win.addEventListener('touchcancel', handleTouchEnd, passiveCapture)
  win.addEventListener('click', handleClick, capture)

  return () => {
    win.removeEventListener('scroll', handleScroll, passiveCapture)
    win.removeEventListener('touchstart', handleTouchStart, passiveCapture)
    win.removeEventListener('touchmove', handleTouchMove, passiveCapture)
    win.removeEventListener('touchend', handleTouchEnd, passiveCapture)
    win.removeEventListener('touchcancel', handleTouchEnd, passiveCapture)
    win.removeEventListener('click', handleClick, capture)
  }
}
