import './assets/main.css'
import './lib/echarts'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import { useLocaleStore } from './stores/locale'
import { useAuth } from './features/auth/composables/useAuth'
import { useSetupStatus } from './features/auth/composables/useSetupStatus'
import { useLoginOptions } from './features/auth/composables/useLoginOptions'
import { waitForReachableSession } from './features/auth/lib/session-unavailable'
import { installAppBadgeClearing } from './features/push/lib/app-badge'

// Chrome 124+ blocks aria-hidden from being applied to an element that contains
// a focused descendant. Reka UI's dialog uses the aria-hidden package which sets
// aria-hidden="true" on background content when a modal opens. If the focused
// element is in the background (e.g. a book card dropdown trigger), Chrome blocks
// it and logs a warning, leaving the background incorrectly accessible to screen
// readers. This observer proactively blurs the focused descendant the moment
// aria-hidden="true" lands, allowing the aria-hidden to succeed.
const ariaHiddenObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type !== 'attributes' || mutation.attributeName !== 'aria-hidden') continue
    const target = mutation.target as HTMLElement
    if (target.getAttribute('aria-hidden') !== 'true') continue
    const focused = document.activeElement
    if (focused instanceof HTMLElement && target.contains(focused)) {
      focused.blur()
    }
  }
})
ariaHiddenObserver.observe(document.body, {
  subtree: true,
  attributes: true,
  attributeFilter: ['aria-hidden'],
})

const STALE_CHUNK_RELOAD_KEY = 'bookorbit:stale-chunk-reload-at'
const STALE_CHUNK_RELOAD_WINDOW_MS = 30_000
const CHUNK_LOAD_ERROR_PATTERN = /dynamically imported module|Importing a module script failed|Unable to preload CSS/i

// After a server upgrade the old build's lazy chunks are gone, and a tap that needs one fails
// silently. One reload picks up the new build; the timestamp stops a reload loop when the chunk
// is missing for some other reason.
function reloadOnceForStaleChunk(url?: string): boolean {
  if (!navigator.onLine) return false
  try {
    const lastReloadAt = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0)
    if (Date.now() - lastReloadAt < STALE_CHUNK_RELOAD_WINDOW_MS) return false
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  if (url) window.location.assign(url)
  else window.location.reload()
  return true
}

// Lazy route components load after the global guards, so a chunk that fails mid-navigation should
// reload into the page the user tapped, not the one they were leaving.
let pendingNavigationHref: string | null = null
router.beforeEach((to) => {
  pendingNavigationHref = router.resolve(to.fullPath).href
})
router.afterEach((to) => {
  if (pendingNavigationHref === router.resolve(to.fullPath).href) pendingNavigationHref = null
})

window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunk(pendingNavigationHref ?? undefined)) event.preventDefault()
})

router.onError((error: unknown, to) => {
  pendingNavigationHref = null
  const message = error instanceof Error ? error.message : String(error)
  if (!CHUNK_LOAD_ERROR_PATTERN.test(message)) return
  reloadOnceForStaleChunk(router.resolve(to.fullPath).href)
})

const app = createApp(App)

app.use(createPinia())
app.use(i18n)

// Load and apply the initial locale (stored preference or browser language) before mount
// so the first paint is already localized. Server-synced locale is applied later during auth.
const localeStore = useLocaleStore()
try {
  await localeStore.setLocale(localeStore.locale)
} catch {
  // English is bundled, so a locale chunk that cannot load must not keep the app from starting.
}

// Resolve setup status/auth before installing router.
// app.use(router) triggers initial navigation and guard execution.
const { fetchSetupStatus, needsSetup } = useSetupStatus()
const { init, sessionUnavailable } = useAuth()

async function resolveSession(): Promise<boolean> {
  // The session refresh does not depend on setup status, so both requests run together.
  await Promise.all([
    Promise.all([fetchSetupStatus(), useLoginOptions().fetchLoginOptions()]).catch(() => {
      // If setup-status check fails, continue with normal auth bootstrap.
    }),
    init(),
  ])
  return needsSetup.value === true || !sessionUnavailable.value
}

if (!(await resolveSession())) {
  await waitForReachableSession({
    container: '#app',
    labels: {
      title: i18n.global.t('auth.sessionUnavailable.title'),
      message: i18n.global.t('auth.sessionUnavailable.message'),
      retry: i18n.global.t('auth.sessionUnavailable.retry'),
      retrying: i18n.global.t('auth.sessionUnavailable.retrying'),
    },
    checkSession: resolveSession,
  })
}

app.use(router)
app.mount('#app')
installAppBadgeClearing()

function prefetchPdfReader() {
  void Promise.all([import('./features/reader/pdf-v4/PdfV4ReaderView.vue'), import('@embedpdf/pdfium/pdfium.wasm?url')])
    .then(([, wasm]) => fetch(wasm.default, { cache: 'force-cache' }))
    .catch(() => {
      // Prefetch is best-effort; opening a PDF loads the reader on demand.
    })
}

function prefersLeanDownloads(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return true
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

function whenIdle(callback: () => void) {
  const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(callback, { timeout: 10_000 })
  } else {
    window.setTimeout(callback, 5_000)
  }
}

// The PDF reader and pdfium.wasm are large, so they are warmed only once someone opens a book on a
// desktop-class connection, never on launch.
let pdfReaderPrefetchQueued = false
router.afterEach((to, _from, failure) => {
  if (failure || pdfReaderPrefetchQueued || to.name !== 'book-detail') return
  pdfReaderPrefetchQueued = true
  if (!prefersLeanDownloads()) whenIdle(prefetchPdfReader)
})
