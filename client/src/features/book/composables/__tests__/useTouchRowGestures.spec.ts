import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MS, SWIPE_MAX_PX, useTouchRowGestures } from '../useTouchRowGestures'

function pointer(type: string, init: { x?: number; y?: number; pointerType?: string; pointerId?: number } = {}): PointerEvent {
  return {
    type,
    clientX: init.x ?? 100,
    clientY: init.y ?? 100,
    pointerType: init.pointerType ?? 'touch',
    pointerId: init.pointerId ?? 1,
    currentTarget: null,
  } as unknown as PointerEvent
}

function setup(overrides: Partial<Parameters<typeof useTouchRowGestures>[0]> = {}) {
  const onLongPress = vi.fn<(source: string) => void>()
  const onSwipeLeft = vi.fn<() => void>()
  const gestures = useTouchRowGestures({ onLongPress, onSwipeLeft, ...overrides })
  return { gestures, onLongPress, onSwipeLeft }
}

describe('useTouchRowGestures', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires a long press after holding still and suppresses the trailing click', () => {
    const { gestures, onLongPress } = setup()
    gestures.handlePointerDown(pointer('pointerdown'))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(onLongPress).toHaveBeenCalledWith('touch')
    gestures.handlePointerUp(pointer('pointerup'))
    expect(gestures.consumeSuppressedClick()).toBe(true)
    expect(gestures.consumeSuppressedClick()).toBe(false)
  })

  it('does not long press on a quick tap', () => {
    const { gestures, onLongPress } = setup()
    gestures.handlePointerDown(pointer('pointerdown'))
    vi.advanceTimersByTime(120)
    gestures.handlePointerUp(pointer('pointerup'))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(gestures.consumeSuppressedClick()).toBe(false)
  })

  it('cancels the long press when the finger scrolls vertically', () => {
    const { gestures, onLongPress, onSwipeLeft } = setup()
    gestures.handlePointerDown(pointer('pointerdown'))
    gestures.handlePointerMove(pointer('pointermove', { y: 130 }))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    gestures.handlePointerUp(pointer('pointerup', { y: 160 }))
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(gestures.swipeOffset.value).toBe(0)
  })

  it('commits a swipe left past the threshold', () => {
    const { gestures, onSwipeLeft } = setup()
    gestures.handlePointerDown(pointer('pointerdown'))
    gestures.handlePointerMove(pointer('pointermove', { x: 85 }))
    gestures.handlePointerMove(pointer('pointermove', { x: 0 }))
    expect(gestures.swiping.value).toBe(true)
    expect(gestures.swipeOffset.value).toBe(-SWIPE_MAX_PX + 4)
    gestures.handlePointerUp(pointer('pointerup', { x: 0 }))
    expect(onSwipeLeft).toHaveBeenCalledOnce()
    expect(gestures.swipeOffset.value).toBe(0)
    expect(gestures.consumeSuppressedClick()).toBe(true)
  })

  it('springs back without acting on a short swipe', () => {
    const { gestures, onSwipeLeft } = setup()
    gestures.handlePointerDown(pointer('pointerdown'))
    gestures.handlePointerMove(pointer('pointermove', { x: 60 }))
    gestures.handlePointerUp(pointer('pointerup', { x: 60 }))
    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(gestures.swipeOffset.value).toBe(0)
  })

  it('ignores right swipes and disabled swipes', () => {
    const { gestures, onSwipeLeft } = setup({ canSwipe: () => false })
    gestures.handlePointerDown(pointer('pointerdown'))
    gestures.handlePointerMove(pointer('pointermove', { x: 0 }))
    gestures.handlePointerUp(pointer('pointerup', { x: 0 }))
    expect(onSwipeLeft).not.toHaveBeenCalled()

    const right = setup()
    right.gestures.handlePointerDown(pointer('pointerdown'))
    right.gestures.handlePointerMove(pointer('pointermove', { x: 200 }))
    right.gestures.handlePointerUp(pointer('pointerup', { x: 200 }))
    expect(right.onSwipeLeft).not.toHaveBeenCalled()
  })

  it('ignores mouse pointers so desktop clicks are unchanged', () => {
    const { gestures, onLongPress } = setup()
    gestures.handlePointerDown(pointer('pointerdown', { pointerType: 'mouse' }))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('routes a desktop context menu without suppressing later clicks', () => {
    const { gestures, onLongPress } = setup()
    const preventDefault = vi.fn<() => void>()
    gestures.handleContextMenu({ preventDefault } as unknown as MouseEvent)
    gestures.handleContextMenu({ preventDefault } as unknown as MouseEvent)
    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(onLongPress).toHaveBeenCalledTimes(2)
    expect(onLongPress).toHaveBeenLastCalledWith('contextmenu')
    expect(gestures.consumeSuppressedClick()).toBe(false)
  })

  it('dedupes the platform context menu that follows a touch long press', () => {
    const { gestures, onLongPress } = setup()
    gestures.handlePointerDown(pointer('pointerdown'))
    gestures.handleContextMenu({ preventDefault: vi.fn<() => void>() } as unknown as MouseEvent)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(onLongPress).toHaveBeenCalledExactlyOnceWith('touch')
  })
})
