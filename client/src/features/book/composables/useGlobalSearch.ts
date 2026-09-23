import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { api } from '@/lib/api'
import { fetchSeries } from '@/features/series/api/series'
import type { BookCard, BookQuery, BooksPage, SeriesSummary } from '@bookorbit/types'

const GLOBAL_SEARCH_PAGE_SIZE = 20
const GLOBAL_SEARCH_SERIES_LIMIT = 5
const GLOBAL_SEARCH_DEBOUNCE_MS = 300
const GLOBAL_SEARCH_SERIES_WAIT_MS = 800

export type GlobalSearchResult = BookCard
export type GlobalSearchSeriesResult = SeriesSummary

export function useGlobalSearch(query: Ref<string>) {
  const results = ref<GlobalSearchResult[]>([])
  const total = ref(0)
  const series = ref<GlobalSearchSeriesResult[]>([])
  const seriesTotal = ref(0)
  const loading = ref(false)
  const loadingMore = ref(false)
  const settled = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null
  let seriesController: AbortController | null = null
  let seriesWaitTimer: ReturnType<typeof setTimeout> | null = null
  let releaseSeriesWait: (() => void) | null = null
  let generation = 0
  let activeQuery = ''
  let nextPage = 0

  const hasMore = computed(() => results.value.length < total.value)

  async function loadSeries(q: string, gen: number) {
    const requestController = new AbortController()
    seriesController = requestController
    try {
      const data = await fetchSeries({ q, page: 0, size: GLOBAL_SEARCH_SERIES_LIMIT, sort: 'relevance', order: 'desc' }, requestController.signal)
      if (gen !== generation) return
      series.value = data.items
      seriesTotal.value = data.total
    } catch {
      // Series are a shortcut above the book list; the books still answer the query without them.
    }
  }

  /** A slow series lookup must not stall the books, so the wait for it is capped. */
  function waitForSeries(seriesLoad: Promise<void>): Promise<void> {
    const capped = new Promise<void>((resolve) => {
      releaseSeriesWait = resolve
      seriesWaitTimer = setTimeout(resolve, GLOBAL_SEARCH_SERIES_WAIT_MS)
    })
    return Promise.race([seriesLoad, capped])
  }

  /** `seriesReady` holds the first page back until the series arrive, so they rarely push the book list down under the finger. */
  async function loadPage(q: string, page: number, append: boolean, gen: number, seriesReady?: Promise<void>) {
    const requestController = new AbortController()
    controller = requestController
    if (append) loadingMore.value = true
    else loading.value = true

    try {
      const body: BookQuery = {
        q,
        sort: [{ field: 'relevance', dir: 'desc' }],
        pagination: { page, size: GLOBAL_SEARCH_PAGE_SIZE },
      }
      const res = await api('/api/v1/books/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: requestController.signal,
      })
      if (gen !== generation) return
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: BooksPage = await res.json()
      await seriesReady
      if (gen !== generation) return

      results.value = append ? [...results.value, ...data.items] : data.items
      total.value = data.total
      nextPage = data.page + 1
    } catch {
      if (gen !== generation || requestController.signal.aborted) return
      if (!append) {
        results.value = []
        total.value = 0
      }
    } finally {
      await seriesReady
      if (gen === generation) {
        loading.value = false
        loadingMore.value = false
        settled.value = true
      }
    }
  }

  function reset() {
    if (timer) clearTimeout(timer)
    if (seriesWaitTimer) clearTimeout(seriesWaitTimer)
    releaseSeriesWait?.()
    releaseSeriesWait = null
    controller?.abort()
    seriesController?.abort()
    generation += 1
    nextPage = 0
    results.value = []
    total.value = 0
    series.value = []
    seriesTotal.value = 0
  }

  watch(query, (q) => {
    reset()
    settled.value = false
    activeQuery = q.trim()

    if (activeQuery.length < 2) {
      loading.value = false
      loadingMore.value = false
      return
    }

    loading.value = true
    const gen = generation
    timer = setTimeout(async () => {
      await loadPage(activeQuery, 0, false, gen, waitForSeries(loadSeries(activeQuery, gen)))
    }, GLOBAL_SEARCH_DEBOUNCE_MS)
  })

  onScopeDispose(reset)

  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value || activeQuery.length < 2) return
    await loadPage(activeQuery, nextPage, true, generation)
  }

  function clear() {
    reset()
    activeQuery = ''
    loading.value = false
    loadingMore.value = false
    settled.value = false
  }

  return { results, total, series, seriesTotal, loading, loadingMore, settled, hasMore, loadMore, clear }
}
