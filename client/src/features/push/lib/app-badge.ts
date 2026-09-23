type BadgeNavigator = Navigator & { clearAppBadge?: () => Promise<void> }

export function clearAppBadge(nav: Navigator = navigator): void {
  const badgeNav = nav as BadgeNavigator
  if (typeof badgeNav.clearAppBadge !== 'function') return
  badgeNav.clearAppBadge().catch(() => {})
}

/**
 * Clears the Home Screen badge that push notifications set, now and every time the app comes back
 * to the foreground. Returns a function that removes the listener.
 */
export function installAppBadgeClearing(doc: Document = document, nav: Navigator = navigator): () => void {
  function handleVisibilityChange() {
    if (doc.visibilityState === 'visible') clearAppBadge(nav)
  }
  handleVisibilityChange()
  doc.addEventListener('visibilitychange', handleVisibilityChange)
  return () => doc.removeEventListener('visibilitychange', handleVisibilityChange)
}
