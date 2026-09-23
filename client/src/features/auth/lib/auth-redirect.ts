import type { LocationQueryValue, Router } from 'vue-router'

const AUTH_PAGE_PATHS = new Set(['/login', '/setup', '/register', '/oauth2-callback', '/magic'])

/**
 * A redirect target is only honoured when it is an in-app path. Anything that could leave the
 * origin (`//host`, `/\host`, absolute URLs) or loop back into an auth page is dropped.
 */
export function sanitizeRedirect(value: LocationQueryValue | LocationQueryValue[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (typeof candidate !== 'string') return null
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) return null
  const path = candidate.split(/[?#]/, 1)[0]!
  if (AUTH_PAGE_PATHS.has(path)) return null
  return candidate
}

function currentOrPendingRoute(router: Router) {
  const current = router.currentRoute.value
  if (current.matched.length > 0) return current
  // Before the initial navigation the router still reports START_LOCATION ("/"), so read the URL
  // the page was actually opened with.
  return router.resolve(router.options.history.location)
}

/** The in-app location the user should land on after signing in again, if any. */
export function captureRedirectTarget(router: Router): string | null {
  const route = currentOrPendingRoute(router)
  if (route.meta.public) return sanitizeRedirect(route.query.redirect)
  if (route.fullPath === '/') return null
  return sanitizeRedirect(route.fullPath)
}

export function loginLocation(redirect: string | null) {
  return redirect ? { path: '/login', query: { redirect } } : { path: '/login' }
}
