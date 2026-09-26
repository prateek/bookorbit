import { onUnmounted, ref, unref, type MaybeRef } from 'vue'
import { api } from '@/lib/api'
import { currentOfflineSession } from '@/features/offline/offline-session'

export interface ProgressSnapshot {
  percentage: number
  cfi?: string | null
  pageNumber?: number | null
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000
const MIN_SESSION_MS = 10 * 1000
const ELAPSED_UPDATE_INTERVAL_MS = 30 * 1000

export interface ReadingSessionOptions {
  trackingEnabled?: MaybeRef<boolean>
  /** Labels the queued session in sync diagnostics. */
  bookId?: number
}

function generateSessionId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` // codeql[js/insecure-randomness] - session IDs are non-security deduplication keys
}

export function useReadingSession(bookFileId: number, getProgress: () => ProgressSnapshot, options: ReadingSessionOptions = {}) {
  let sessionId = generateSessionId()
  let startedAt: Date | null = null
  let activeMs = 0
  let activeStart: number | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let startProgress: number | null = null
  let ended = false

  const elapsedMinutes = ref(0)
  let elapsedInterval: ReturnType<typeof setInterval> | null = null
  const trackingEnabled = options.trackingEnabled ?? true

  function canTrack(): boolean {
    return unref(trackingEnabled)
  }

  function getActiveMs(): number {
    if (activeStart === null) return activeMs
    return activeMs + (Date.now() - activeStart)
  }

  function updateElapsed() {
    if (!startedAt || ended) {
      elapsedMinutes.value = 0
      return
    }
    elapsedMinutes.value = Math.floor(getActiveMs() / 60_000)
  }

  function startElapsedInterval() {
    stopElapsedInterval()
    elapsedInterval = setInterval(updateElapsed, ELAPSED_UPDATE_INTERVAL_MS)
  }

  function stopElapsedInterval() {
    if (elapsedInterval !== null) {
      clearInterval(elapsedInterval)
      elapsedInterval = null
    }
  }

  function startSession() {
    startedAt = new Date()
    activeStart = Date.now()
    activeMs = 0
    ended = false
    startProgress = getProgress().percentage
    resetIdleTimer()
    updateElapsed()
    startElapsedInterval()
  }

  function pauseTimer() {
    if (activeStart !== null) {
      activeMs += Date.now() - activeStart
      activeStart = null
    }
    clearIdleTimer()
  }

  function resumeTimer() {
    if (activeStart !== null) return
    activeStart = Date.now()
    resetIdleTimer()
  }

  function resetIdleTimer() {
    clearIdleTimer()
    idleTimer = setTimeout(endSession, IDLE_TIMEOUT_MS)
  }

  function clearIdleTimer() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function onActivity() {
    if (!canTrack()) return
    // No active session or previous session ended (e.g. after idle timeout) - start fresh.
    if (!startedAt || ended) {
      sessionId = generateSessionId()
      startSession()
      return
    }
    if (activeStart === null) resumeTimer()
    resetIdleTimer()
  }

  /** `keepalive` lets the request outlive a page that is being closed or unloaded. */
  function endSession(keepalive = false) {
    if (!canTrack()) {
      clearIdleTimer()
      stopElapsedInterval()
      startedAt = null
      activeStart = null
      activeMs = 0
      ended = true
      elapsedMinutes.value = 0
      return
    }
    if (ended || !startedAt) return
    ended = true
    clearIdleTimer()
    stopElapsedInterval()

    if (activeStart !== null) {
      activeMs += Date.now() - activeStart
      activeStart = null
    }

    elapsedMinutes.value = 0

    if (activeMs < MIN_SESSION_MS) return

    const endedAt = new Date()
    const snap = getProgress()
    const durationSeconds = Math.floor(activeMs / 1000)
    const progressDelta = startProgress !== null ? Number((snap.percentage - startProgress).toFixed(4)) : null
    const endProgress = snap.percentage

    const body = {
      sessionId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSeconds,
      progressDelta,
      endProgress,
    }

    const url = `/api/v1/books/files/${bookFileId}/sessions`
    const post = (withKeepalive: boolean) =>
      api(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(withKeepalive ? { keepalive: true } : {}),
      }).catch(() => {})

    // Queued so a session read offline still counts; the server keeps one row per sessionId, so the
    // keepalive copy a closing page also sends cannot double it.
    const offline = currentOfflineSession()
    if (!offline) {
      void post(keepalive)
      return
    }
    offline.replica.recordSession(bookFileId, options.bookId ?? 0, body).then(
      () => {
        if (keepalive && navigator.onLine !== false) void post(true)
      },
      () => void post(keepalive),
    )
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      pauseTimer()
    } else if (startedAt && !ended) {
      resumeTimer()
    }
  }

  // iOS Home Screen apps never fire beforeunload; pagehide is the last event they reliably send.
  function onPageHide() {
    endSession(true)
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)

  onUnmounted(() => {
    endSession()
    stopElapsedInterval()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
  })

  return { onActivity, endSession, elapsedMinutes }
}
