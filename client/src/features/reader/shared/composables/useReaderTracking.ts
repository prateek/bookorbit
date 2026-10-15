import { computed, ref } from 'vue'
import type { LocationQuery } from 'vue-router'
import type { ReadStatus } from '@bookorbit/types'

export type ReaderMode = 'peek' | 'reread' | null

/** How long a reader waits for the read status before tracking as it would without one. */
export const READ_STATUS_WAIT_MS = 4_000

export function readerModeOf(value: LocationQuery[string] | undefined): ReaderMode {
  const mode = Array.isArray(value) ? value[0] : value
  return mode === 'peek' || mode === 'reread' ? mode : null
}

export type StartTracking = (query: LocationQuery) => LocationQuery

/**
 * The query a reader shows once "Start reading" turns a peek into tracked reading. The reader shell
 * passes its own rule (a finished book starts a reread); a reader mounted on its own only drops the peek.
 */
export function trackedReadingQuery(query: LocationQuery, startTracking?: StartTracking): LocationQuery {
  if (startTracking) return startTracking(query)
  const next = { ...query }
  delete next.mode
  return next
}

export interface TrackingInput {
  mode: ReaderMode
  /** False until the book's read status is known (or known to be unavailable). */
  resolved: boolean
  status: ReadStatus | null
}

/**
 * A finished book opened without `mode=reread` is only being looked at: tracking it would let the
 * server's activity rule turn it into a reread nobody asked for.
 */
export function isAutoPeek({ mode, resolved, status }: TrackingInput): boolean {
  return resolved && mode !== 'reread' && status === 'read'
}

export function isTrackingEnabled(input: TrackingInput): boolean {
  return input.resolved && input.mode !== 'peek' && !isAutoPeek(input)
}

/**
 * Decides once per open whether the reader records position and sessions. Status changes made while
 * reading (the end card's Mark as read) must not switch tracking off mid-chapter, so only the first
 * status reported counts. The mode is latched too: leaving the reader updates the route before it
 * unmounts, and the final position save and session end must still see the mode it was opened with.
 */
export function useReaderTracking(initialMode: ReaderMode) {
  const mode = ref<ReaderMode>(initialMode)
  const resolved = ref(false)
  const status = ref<ReadStatus | null>(null)
  let markResolved: () => void = () => {}
  const ready = new Promise<void>((done) => {
    markResolved = done
  })

  const input = computed<TrackingInput>(() => ({ mode: mode.value, resolved: resolved.value, status: status.value }))
  const trackingEnabled = computed(() => isTrackingEnabled(input.value))
  const peeking = computed(() => input.value.mode === 'peek' || isAutoPeek(input.value))

  /** Unknown status (no book details, offline with no snapshot) falls back to tracking as before. */
  function resolve(readStatus: ReadStatus | null | undefined) {
    if (resolved.value) return
    status.value = readStatus ?? null
    resolved.value = true
    markResolved()
  }

  /** A request that stalls (captive portal, half-open socket) must not hold the reader, so it counts as unknown once the wait is over. */
  function resolveFrom(readStatus: Promise<ReadStatus | null | undefined>, waitMs = READ_STATUS_WAIT_MS) {
    const timer = setTimeout(() => resolve(null), waitMs)
    void readStatus.then(resolve, () => resolve(null)).finally(() => clearTimeout(timer))
  }

  /** Turns this open into tracked reading and returns the query to show it: a finished book starts a reread. */
  function startTracking(query: LocationQuery): LocationQuery {
    const next = { ...query }
    if (status.value === 'read') next.mode = 'reread'
    else delete next.mode
    mode.value = readerModeOf(next.mode)
    return next
  }

  return { trackingEnabled, peeking, resolved: computed(() => resolved.value), resolve, resolveFrom, whenResolved: () => ready, startTracking }
}
