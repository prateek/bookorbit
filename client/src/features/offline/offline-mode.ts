import { ref, watch } from 'vue'
import type { Router } from 'vue-router'
import type { AuthUser } from '@bookorbit/types'
import { storage } from '@/services/storage'

/**
 * Launching with no server. The profile of the last signed-in user is kept on the device, so an
 * installed app opened in airplane mode can start as that user and reach the pages that work from
 * local data (downloads and the reader) instead of stopping at a retry screen. It carries no
 * credential: every request still needs the session, and the first one that reaches the server
 * decides whether that session is still good.
 */

const OFFLINE_USER_KEY = 'bookorbit:offline-user'

/** The app is running on the stored profile because the server could not be reached. */
export const offlineMode = ref(false)

export function rememberOfflineUser(user: AuthUser) {
  try {
    storage.set(OFFLINE_USER_KEY, user)
  } catch {
    // Storage full or blocked: offline launch is unavailable, nothing else is affected.
  }
}

export function readOfflineUser(): AuthUser | null {
  try {
    const user = storage.get<AuthUser | null>(OFFLINE_USER_KEY, null)
    return typeof user?.id === 'number' ? user : null
  } catch {
    return null
  }
}

export function forgetOfflineUser() {
  storage.remove(OFFLINE_USER_KEY)
}

/** Keeps offline-mode navigation on pages that can render without the server. */
export function registerOfflineGuard(router: Router) {
  router.beforeEach((to) => {
    if (!offlineMode.value || to.meta.public || to.meta.offlineCapable) return true
    return { name: 'downloads', query: { offline: '1' } }
  })
}

/**
 * Leaves offline mode once the server answers again. `reconnect` re-runs the normal session check;
 * if the stored session turned out to be gone, the user is sent to sign in.
 */
export function watchForReconnect(router: Router, reconnect: () => Promise<void>, signedIn: () => boolean) {
  async function attempt() {
    if (!offlineMode.value) return
    await reconnect()
    if (offlineMode.value) return
    if (!signedIn()) {
      await router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
      return
    }
    if (router.currentRoute.value.query.offline === '1') await router.replace({ name: 'dashboard' })
  }
  window.addEventListener('online', () => void attempt())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void attempt()
  })
  watch(offlineMode, (value) => {
    if (value && navigator.onLine) void attempt()
  })
}
