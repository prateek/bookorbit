export type StatisticsTab = 'library' | 'user'

const LAST_TAB_STORAGE_KEY = 'bookorbit.statistics.lastTab'
const PHONE_QUERY = '(max-width: 767px)'

function isStatisticsTab(value: unknown): value is StatisticsTab {
  return value === 'library' || value === 'user'
}

function readLastTab(): StatisticsTab | null {
  try {
    const stored = localStorage.getItem(LAST_TAB_STORAGE_KEY)
    return isStatisticsTab(stored) ? stored : null
  } catch {
    return null
  }
}

export function rememberStatisticsTab(tab: StatisticsTab): void {
  try {
    localStorage.setItem(LAST_TAB_STORAGE_KEY, tab)
  } catch {
    // Private mode or blocked storage: the default tab is still sensible.
  }
}

function isPhone(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches
}

/**
 * An explicit `?tab=` wins, then the tab this reader last chose. A first visit from a phone lands on
 * My Reading, because a reader there comes for their own numbers rather than library health.
 */
export function resolveStatisticsTab(tabQuery: unknown): StatisticsTab {
  const tab = Array.isArray(tabQuery) ? tabQuery[0] : tabQuery
  if (isStatisticsTab(tab)) return tab
  return readLastTab() ?? (isPhone() ? 'user' : 'library')
}
