import { onMounted, onUnmounted } from 'vue'

/** Matches the reading-session idle timeout: past this, the reader has most likely put the device down. */
export const WAKE_LOCK_IDLE_MS = 5 * 60 * 1000

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

/**
 * Keeps the screen on while the reader is in use, and lets it sleep after a stretch without any
 * interaction. Reader content in an iframe never reaches the window listeners, so the reader also
 * reports its own activity (page turns, taps) through `notifyActivity`.
 */
export function useWakeLock(idleMs = WAKE_LOCK_IDLE_MS) {
  let wakeLock: WakeLockSentinel | null = null
  let acquiring = false
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let active = false

  async function acquire() {
    if (!('wakeLock' in navigator) || !navigator.wakeLock) return
    if (wakeLock || acquiring || document.visibilityState === 'hidden') return
    acquiring = true
    try {
      const sentinel = await navigator.wakeLock.request('screen')
      if (!active) {
        sentinel.release().catch(() => {})
        return
      }
      wakeLock = sentinel
      sentinel.addEventListener('release', () => {
        if (wakeLock === sentinel) wakeLock = null
      })
    } catch {
      // Silently ignore - browser may deny or not support
    } finally {
      acquiring = false
    }
  }

  function release() {
    wakeLock?.release().catch(() => {})
    wakeLock = null
  }

  function clearIdleTimer() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function resetIdleTimer() {
    clearIdleTimer()
    idleTimer = setTimeout(() => {
      idleTimer = null
      release()
    }, idleMs)
  }

  function notifyActivity() {
    if (!active) return
    resetIdleTimer()
    if (!wakeLock) void acquire()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') notifyActivity()
  }

  onMounted(() => {
    active = true
    notifyActivity()
    document.addEventListener('visibilitychange', onVisibilityChange)
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, notifyActivity, { passive: true, capture: true })
  })

  onUnmounted(() => {
    active = false
    clearIdleTimer()
    release()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, notifyActivity, { capture: true })
  })

  return { notifyActivity }
}
