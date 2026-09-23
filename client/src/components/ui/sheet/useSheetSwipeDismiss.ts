const DRAG_START_PX = 8
const DISMISS_MIN_PX = 96
const DISMISS_HEIGHT_RATIO = 0.3
const DISMISS_VELOCITY_PX_PER_MS = 0.6
const FLICK_MIN_PX = 32
const SNAP_BACK_MS = 200
const DISMISS_SETTLE_MS = 400
const NO_DRAG_SELECTOR = 'input, textarea, select, [contenteditable="true"], [data-sheet-swipe-ignore]'

/** A drag only belongs to the sheet when nothing between the finger and the sheet can still scroll up. */
function canStartDrag(target: EventTarget | null, sheet: HTMLElement): boolean {
  if (!(target instanceof Element) || target.closest(NO_DRAG_SELECTOR)) return false
  for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0) return false
  }
  return sheet.scrollTop <= 0
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Swipe-down-to-dismiss for bottom sheets. Touch events rather than pointer events, because the
 * browser cancels pointer streams as soon as it starts a native scroll, and a non-passive
 * touchmove is the only way to keep the page from scrolling while the sheet follows the finger.
 */
export function useSheetSwipeDismiss(options: { enabled: () => boolean; dismiss: () => void }) {
  let sheet: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let startTime = 0
  let offset = 0
  let tracking = false
  let dragging = false

  function reset() {
    tracking = false
    dragging = false
    offset = 0
  }

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    const el = event.currentTarget
    if (!options.enabled() || event.touches.length !== 1 || !touch || !(el instanceof HTMLElement)) return
    if (!canStartDrag(event.target, el)) return
    sheet = el
    startX = touch.clientX
    startY = touch.clientY
    startTime = performance.now()
    offset = 0
    tracking = true
    dragging = false
  }

  function handleTouchMove(event: TouchEvent) {
    const touch = event.touches[0]
    if (!tracking || !sheet || !touch) return
    const dy = touch.clientY - startY
    const dx = touch.clientX - startX
    if (!dragging) {
      if (Math.abs(dy) < DRAG_START_PX && Math.abs(dx) < DRAG_START_PX) return
      if (dy <= 0 || Math.abs(dx) > dy) {
        reset()
        return
      }
      dragging = true
      sheet.style.transition = 'none'
    }
    if (event.cancelable) event.preventDefault()
    offset = Math.max(0, dy)
    sheet.style.transform = `translate3d(0, ${offset}px, 0)`
  }

  function handleTouchEnd() {
    const el = sheet
    const wasDragging = dragging
    const distance = offset
    const elapsed = Math.max(1, performance.now() - startTime)
    reset()
    if (!el || !wasDragging) return

    const velocity = distance / elapsed
    const farEnough = distance > Math.max(DISMISS_MIN_PX, el.offsetHeight * DISMISS_HEIGHT_RATIO)
    const flicked = distance > FLICK_MIN_PX && velocity > DISMISS_VELOCITY_PX_PER_MS
    const shouldDismiss = farEnough || flicked
    if (shouldDismiss) {
      // The exit animation starts from the inline offset, so the sheet keeps sliding down from the finger.
      options.dismiss()
      window.setTimeout(() => {
        if (el.isConnected && el.dataset.state === 'open') snapBack(el)
      }, DISMISS_SETTLE_MS)
      return
    }
    snapBack(el)
  }

  function snapBack(el: HTMLElement) {
    el.style.transition = prefersReducedMotion() ? 'none' : `transform ${SNAP_BACK_MS}ms ease-out`
    el.style.transform = ''
    window.setTimeout(() => {
      el.style.transition = ''
    }, SNAP_BACK_MS)
  }

  return { handleTouchStart, handleTouchMove, handleTouchEnd }
}
