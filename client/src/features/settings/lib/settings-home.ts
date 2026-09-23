import type { RouteLocationRaw } from 'vue-router'

/**
 * The query SidebarProvider uses to swap the sidebar for the phone drawer. It must match exactly:
 * Tailwind's `md` starts at 768px too, so a `min-width: 768px` check would send a 768px wide
 * viewport (portrait iPad) to a settings page with neither the settings sidebar nor the index.
 */
const DRAWER_LAYOUT_QUERY = '(max-width: 768px)'

export const SETTINGS_HOME_ROUTE = 'settings-home'
export const SETTINGS_DESKTOP_LANDING_ROUTE = 'settings-appearance-theme'

/**
 * Phones get a list of every settings page at /settings. On wider screens the sidebar already is
 * that list, so the index would only repeat it next to itself; land on the first page instead.
 */
export function settingsHomeGuard(): true | RouteLocationRaw {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  const usesDrawer = window.matchMedia(DRAWER_LAYOUT_QUERY).matches
  return usesDrawer ? true : { name: SETTINGS_DESKTOP_LANDING_ROUTE, replace: true }
}
