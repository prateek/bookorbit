import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

export const LONG_PRESS_MS = 500
export const SWIPE_THRESHOLD_PX = 72
export const SWIPE_MAX_PX = 104
const MOVE_TOLERANCE_PX = 10

export type LongPressSource = 'touch' | 'contextmenu'

interface TouchRowGestureOptions {
  onLongPress: (source: LongPressSource) => void
  onSwipeLeft?: () => void
  canSwipe?: () => boolean
  canLongPress?: () => boolean
}

type GestureAxis = 'x' | 'none' | null

/**
 * Touch-only long-press and swipe-left for list rows and cards. Mouse and pen pointers are ignored,
 * so desktop clicks, drags and text selection behave as before. A gesture commits to an axis after
 * 10px of travel: vertical travel is left to the browser (scrolling), horizontal-left travel drives
 * the swipe. Pair it with `touch-action: pan-y` on the element so the browser keeps vertical scroll.
 */
export function useTouchRowGestures(options: TouchRowGestureOptions) {
  const swipeOffset = ref(0)
  const swiping = ref(false)

  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let axis: GestureAxis = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let longPressFired = false
  let suppressClick = false

  function clearTimer() {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  function resetGesture() {
    clearTimer()
    pointerId = null
    axis = null
    swipeOffset.value = 0
    swiping.value = false
  }

  function fireTouchLongPress() {
    clearTimer()
    if (longPressFired) return
    longPressFired = true
    suppressClick = true
    options.onLongPress('touch')
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch') return
    resetGesture()
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    longPressFired = false
    suppressClick = false
    if (options.canLongPress?.() === false) return
    timer = setTimeout(() => {
      timer = null
      if (pointerId !== null && axis === null) fireTouchLongPress()
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(event: PointerEvent) {
    if (pointerId === null || event.pointerId !== pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY

    if (axis === null) {
      if (Math.abs(dx) < MOVE_TOLERANCE_PX && Math.abs(dy) < MOVE_TOLERANCE_PX) return
      clearTimer()
      const horizontalLeft = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.5
      if (horizontalLeft && !longPressFired && options.onSwipeLeft && options.canSwipe?.() !== false) {
        axis = 'x'
        swiping.value = true
        const target = event.currentTarget
        if (target instanceof Element && typeof target.setPointerCapture === 'function') {
          try {
            target.setPointerCapture(event.pointerId)
          } catch {
            // The pointer may already be released; the swipe still tracks via bubbling moves.
          }
        }
      } else {
        axis = 'none'
      }
    }

    if (axis === 'x') swipeOffset.value = Math.max(-SWIPE_MAX_PX, Math.min(0, dx))
  }

  function handlePointerUp(event: PointerEvent) {
    if (pointerId === null || event.pointerId !== pointerId) return
    const committed = axis === 'x' && swipeOffset.value <= -SWIPE_THRESHOLD_PX
    if (axis === 'x') suppressClick = true
    resetGesture()
    if (committed) options.onSwipeLeft?.()
  }

  function handlePointerCancel(event: PointerEvent) {
    if (pointerId === null || event.pointerId !== pointerId) return
    resetGesture()
  }

  /** Right-click on desktop, and the platform long-press on Android, arrive here. */
  function handleContextMenu(event: MouseEvent) {
    event.preventDefault()
    if (longPressFired) return
    if (options.canLongPress?.() === false) return
    if (pointerId !== null) {
      fireTouchLongPress()
      return
    }
    options.onLongPress('contextmenu')
  }

  /** True once for the click that trails a long-press or swipe, so it does not also open the book. */
  function consumeSuppressedClick(): boolean {
    if (!suppressClick) return false
    suppressClick = false
    return true
  }

  if (getCurrentInstance()) onBeforeUnmount(clearTimer)

  return {
    swipeOffset,
    swiping,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleContextMenu,
    consumeSuppressedClick,
  }
}
