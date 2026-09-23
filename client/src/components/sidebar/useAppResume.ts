import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue'

/** Dispatched on window when the app comes back to the foreground after a long absence. */
export const APP_RESUMED_EVENT = 'bookorbit:app-resumed'
export const APP_RESUME_THRESHOLD_MS = 5 * 60 * 1000

/**
 * Watches page visibility and announces a resume once the page was hidden for longer than
 * `thresholdMs`. A Home Screen web app on iOS keeps its old state for hours, so views that care
 * about freshness listen with {@link onAppResumed} instead of each tracking visibility.
 */
export function useAppResumeWatcher(thresholdMs = APP_RESUME_THRESHOLD_MS) {
  let hiddenAt: number | null = null

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const awayMs = hiddenAt === null ? 0 : Date.now() - hiddenAt
    hiddenAt = null
    if (awayMs > thresholdMs) window.dispatchEvent(new CustomEvent(APP_RESUMED_EVENT, { detail: { awayMs } }))
  }

  onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange))
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', handleVisibilityChange))
}

/**
 * Runs `callback` when the app resumes. A view parked in KeepAlive defers the callback to its next
 * activation, so a stack of cached pages does not all refetch behind the visible one.
 */
export function onAppResumed(callback: () => void) {
  let active = true
  let pending = false

  function handleResumed() {
    if (active) callback()
    else pending = true
  }

  onMounted(() => window.addEventListener(APP_RESUMED_EVENT, handleResumed))
  onBeforeUnmount(() => window.removeEventListener(APP_RESUMED_EVENT, handleResumed))
  onDeactivated(() => {
    active = false
  })
  onActivated(() => {
    active = true
    if (!pending) return
    pending = false
    callback()
  })
}
