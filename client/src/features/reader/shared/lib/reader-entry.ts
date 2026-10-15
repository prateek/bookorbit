import type { HistoryState } from 'vue-router'

const TRACKED_READER_STATE_KEY = 'readerTrackedPath'

type EntryState = Record<string, unknown> | null

function currentState(): EntryState {
  return window.history.state as EntryState
}

function showsOtherScreen(state: EntryState, path: string): boolean {
  const current = state?.current
  return typeof current === 'string' && current.split(/[?#]/, 1)[0] !== path
}

function replaceEntryState(state: Record<string, unknown>) {
  try {
    window.history.replaceState(state, '')
  } catch {
    // Without the update, coming back opens like a fresh visit.
  }
}

/**
 * History state for an entry that reopens a tracked reading session at `path`, such as a resumed app
 * launch. Keyed by path because `router.replace` carries history state over to the next chapter.
 */
export function trackedReaderState(path: string): HistoryState {
  return { [TRACKED_READER_STATE_KEY]: path }
}

/**
 * Whether the history entry already showed the reader at `path` with tracking on: a back or forward
 * traversal, a reload, or a resumed launch of that session, rather than a fresh open or a peek.
 */
export function isTrackedReaderEntry(path: string, state: EntryState = currentState()): boolean {
  return state?.[TRACKED_READER_STATE_KEY] === path
}

/**
 * Whether the reader opening at `path` comes back to its own tracked entry. A mark for another chapter,
 * carried over by `router.replace`, is cleared so a later replace back to that chapter is not a return.
 * It is set to null rather than deleted because vue-router's push merges its own copy of the state back in.
 */
export function enterReaderEntry(path: string): boolean {
  const state = currentState()
  if (isTrackedReaderEntry(path, state)) return true
  if (typeof state?.[TRACKED_READER_STATE_KEY] === 'string' && !showsOtherScreen(state, path)) {
    replaceEntryState({ ...state, [TRACKED_READER_STATE_KEY]: null })
  }
  return false
}

/** Marks the current history entry as tracking the reader at `path`, unless it already shows another screen. */
export function markTrackedReaderEntry(path: string) {
  const state = currentState()
  if (isTrackedReaderEntry(path, state) || showsOtherScreen(state, path)) return
  replaceEntryState({ ...state, ...trackedReaderState(path) })
}
