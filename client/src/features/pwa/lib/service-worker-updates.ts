const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

/**
 * An installed iOS web app can stay suspended for days and only checks for a new service worker on
 * a navigation, so a new build is also looked for whenever the app returns to the foreground. The
 * new worker activates at once; the stale-chunk reload in main.ts covers pages from the old build.
 */
export function installServiceWorkerUpdateChecks(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  let lastCheck = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
    lastCheck = Date.now()
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined)
  })
}
