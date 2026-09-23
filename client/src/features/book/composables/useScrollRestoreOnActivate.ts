import { type Ref, onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const STORAGE_PREFIX = 'bookorbit:scroll:'
/** Long lists load in pages, so a deep position can take a few page fetches to become reachable. */
const RESTORE_TIMEOUT_MS = 5000
const RESTORE_POLL_MS = 100
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

interface RouterHistoryState {
  position?: number
  forward?: string | null
}

function routerHistoryState(): RouterHistoryState | null {
  const state: unknown = window.history.state
  return state && typeof state === 'object' ? (state as RouterHistoryState) : null
}

/** One slot per history entry, so the same page opened twice keeps two positions. */
export function scrollEntryKey(scope: string, path: string): string {
  const position = routerHistoryState()?.position ?? 0
  return `${STORAGE_PREFIX}${scope}:${position}:${path}`
}

/** Vue Router records `forward` on an entry when it pushes past it, so a value means we came back to it. */
export function isReturningToHistoryEntry(): boolean {
  return Boolean(routerHistoryState()?.forward)
}

export function readScrollPosition(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : null
  } catch {
    return null
  }
}

export function writeScrollPosition(key: string, top: number): void {
  try {
    sessionStorage.setItem(key, String(Math.round(top)))
  } catch {
    // Private mode or a full quota only costs the restore, never the page.
  }
}

function scrollInstantly(el: HTMLElement, top: number) {
  if (typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: 'instant' })
  else el.scrollTop = top
}

/**
 * Scrolls `el` to `target`, retrying while the content is still too short to reach it (data
 * loading, infinite-scroll pages arriving). Stops on arrival, timeout, or the first user input.
 * Returns a function that cancels the restore.
 */
export function restoreScrollPosition(el: HTMLElement, target: number, onDone?: () => void): () => void {
  const deadline = Date.now() + RESTORE_TIMEOUT_MS
  let timer: ReturnType<typeof setInterval> | null = null
  let finished = false

  function stop() {
    if (finished) return
    finished = true
    if (timer !== null) clearInterval(timer)
    for (const type of USER_SCROLL_EVENTS) el.removeEventListener(type, stop)
    onDone?.()
  }

  function step() {
    if (!el.isConnected) return stop()
    const max = Math.max(0, el.scrollHeight - el.clientHeight)
    scrollInstantly(el, Math.min(target, max))
    el.dispatchEvent(new Event('scroll'))
    if (max >= target || Date.now() >= deadline) stop()
  }

  for (const type of USER_SCROLL_EVENTS) el.addEventListener(type, stop, { passive: true })
  step()
  if (!finished) timer = setInterval(step, RESTORE_POLL_MS)
  return stop
}

function isScrollable(el: HTMLElement): boolean {
  const overflowY = getComputedStyle(el).overflowY
  return overflowY === 'auto' || overflowY === 'scroll'
}

/**
 * Keeps a view's scroll container position across KeepAlive deactivation (in memory) and across
 * the view being destroyed and re-created (sessionStorage, per history entry). The second case
 * matters because the reader sits outside AppLayout, so opening a book unmounts every kept-alive
 * view; coming back restores the position once the list has loaded far enough.
 */
export function useScrollRestoreOnActivate(containerRef: Ref<HTMLElement | null>) {
  const path = useRoute().path
  let key = scrollEntryKey('view', path)
  let memoryScrollTop: number | null = null
  let active = false
  let restoring = false
  let cancelRestore: (() => void) | null = null
  let frame = 0
  let listenedEl: HTMLElement | null = null

  function handleScroll() {
    if (!active || restoring || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const el = containerRef.value
      if (!active || restoring || !el?.isConnected) return
      memoryScrollTop = el.scrollTop
      writeScrollPosition(key, el.scrollTop)
    })
  }

  function listen(el: HTMLElement | null) {
    if (el === listenedEl) return
    listenedEl?.removeEventListener('scroll', handleScroll)
    el?.addEventListener('scroll', handleScroll, { passive: true })
    listenedEl = el
  }

  function stopRestoring() {
    cancelRestore?.()
    cancelRestore = null
    restoring = false
  }

  function activate() {
    if (active) return
    active = true
    key = scrollEntryKey('view', path)
    requestAnimationFrame(() => {
      const el = containerRef.value
      if (!active || !el) return
      listen(el)
      if (!isScrollable(el)) return
      const target = memoryScrollTop ?? (isReturningToHistoryEntry() ? readScrollPosition(key) : null)
      if (target === null) return
      stopRestoring()
      restoring = true
      cancelRestore = restoreScrollPosition(el, target, () => {
        restoring = false
        cancelRestore = null
      })
    })
  }

  function deactivate() {
    if (!active) return
    const wasRestoring = restoring
    stopRestoring()
    const el = containerRef.value
    // KeepAlive may already have moved the element out of the document, where scrollTop reads 0;
    // the scroll listener has the last real value in that case.
    if (el?.isConnected && !wasRestoring) {
      memoryScrollTop = el.scrollTop
      writeScrollPosition(key, el.scrollTop)
    }
    active = false
  }

  onMounted(activate)
  onActivated(activate)
  onDeactivated(deactivate)
  onBeforeUnmount(() => {
    deactivate()
    listen(null)
    if (frame) cancelAnimationFrame(frame)
  })
}
