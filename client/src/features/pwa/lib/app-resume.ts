import { watch, type Ref } from 'vue'
import type { Router } from 'vue-router'
import { isStandaloneDisplay } from '@/features/push/lib/push-support'
import { storage } from '@/services/storage'

const STORAGE_KEY = 'bookorbit:pwa-resume'
const PENDING_LOGIN_KEY = 'bookorbit:pwa-resume-login'
const LOGIN_PATHS = new Set(['/login', '/oauth2-callback'])
const MAX_PATH_LENGTH = 4096
const TRANSIENT_QUERY_KEYS = new Set(['token', 'code', 'state', 'access_token', 'refresh_token', 'redirect', 'autoplay'])

interface ResumeLocation {
  version: 1
  userId: number
  path: string
}

function resumablePath(router: Router, value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_PATH_LENGTH) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  const route = router.resolve(value)
  if (!route.name || route.meta.public || route.matched.some((record) => record.redirect)) return null
  const mode = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode
  // Previews intentionally skip progress loading and saving, so they cannot restore a reading position.
  if (route.name === 'reader' && mode === 'peek') return null

  // Reader links can point at an annotation or checkpoint that predates the latest saved progress.
  const query = Object.fromEntries(
    Object.entries(route.query).filter(([key]) => (route.name === 'reader' ? key === 'format' || key === 'mode' : !TRANSIENT_QUERY_KEYS.has(key))),
  )
  return router.resolve({ path: route.path, query }).fullPath
}

function readLocation(router: Router, userId: number): string | null {
  try {
    const saved = storage.get<Partial<ResumeLocation> | null>(STORAGE_KEY, null)
    if (saved?.version !== 1 || saved.userId !== userId) return null
    return resumablePath(router, saved.path)
  } catch {
    return null
  }
}

function clearLocation() {
  try {
    storage.remove(STORAGE_KEY)
  } catch {
    // Storage may be blocked; navigation must still work.
  }
}

function hasPendingLogin(): boolean {
  try {
    return sessionStorage.getItem(PENDING_LOGIN_KEY) === '1'
  } catch {
    return false
  }
}

function setPendingLogin(pending: boolean) {
  try {
    if (pending) sessionStorage.setItem(PENDING_LOGIN_KEY, '1')
    else sessionStorage.removeItem(PENDING_LOGIN_KEY)
  } catch {
    // External sign-in can still complete without restoring the previous screen.
  }
}

/** Install before initial navigation and the offline guard. */
export function installPwaResume(router: Router, user: Readonly<Ref<{ id: number } | null>>): () => void {
  if (!isStandaloneDisplay()) return () => {}

  // An external sign-in reloads the page, so its pending launch must survive that round trip.
  const initial = router.resolve(router.options.history.location || '/')
  let resumePending = initial.fullPath === '/' || (LOGIN_PATHS.has(initial.path) && hasPendingLogin())
  if (!resumePending) setPendingLogin(false)
  let routeUserId: number | null = null

  const stopWatchingUser = watch(
    () => user.value?.id ?? null,
    (_userId, previousUserId) => {
      routeUserId = null
      if (previousUserId === null) return
      resumePending = false
      clearLocation()
      setPendingLogin(false)
    },
    { flush: 'sync' },
  )

  const removeGuard = router.beforeEach((to) => {
    if (!resumePending) return
    if (to.meta.public) {
      resumePending = LOGIN_PATHS.has(to.path) && (to.query.redirect === undefined || to.query.redirect === '/')
      setPendingLogin(resumePending)
      return
    }
    if (!user.value) return
    resumePending = false
    setPendingLogin(false)
    if (to.fullPath !== '/') return
    const path = readLocation(router, user.value.id)
    if (path && path !== '/') {
      const target = router.resolve(path)
      return { path: target.path, query: target.query, replace: true }
    }
  })

  function rememberLocation() {
    if (routeUserId === null || routeUserId !== user.value?.id) return
    const path = resumablePath(router, router.currentRoute.value.fullPath)
    if (!path) return
    try {
      storage.set(STORAGE_KEY, { version: 1, userId: routeUserId, path } satisfies ResumeLocation)
    } catch {
      // A full or unavailable store only disables restoration.
    }
  }

  const removeAfterEach = router.afterEach((_to, _from, failure) => {
    if (failure) return
    routeUserId = user.value?.id ?? null
    rememberLocation()
  })

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') rememberLocation()
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pagehide', rememberLocation)

  return () => {
    stopWatchingUser()
    removeGuard()
    removeAfterEach()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pagehide', rememberLocation)
  }
}
