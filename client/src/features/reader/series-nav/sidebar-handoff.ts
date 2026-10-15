import type { HistoryState } from 'vue-router'

const SIDEBAR_STATE_KEY = 'readerSidebar'

/**
 * Moving to another chapter remounts the reader, and the pin is stored per file, so a sidebar pinned
 * open for chapter browsing rides along in history state to stay open on the next chapter.
 */
export function sidebarHandoffState(open: boolean, pinned: boolean): HistoryState {
  return open && pinned ? { [SIDEBAR_STATE_KEY]: 'pinned' } : {}
}

export function sidebarHandedOffPinned(): boolean {
  const state = window.history.state as Record<string, unknown> | null
  return state?.[SIDEBAR_STATE_KEY] === 'pinned'
}
