import { computed, ref, type Ref } from 'vue'

import type { BookCard, SeriesBooksPage, SeriesDetail } from '@bookorbit/types'
import { fetchSeriesBooks } from '../api/series'
import type { SeriesBookReadFilter, SeriesBookSort, SortDirection } from '../types/series'

const PAGE_SIZE = 50
type LoadOptions = {
  reset?: boolean
  keepPreviousData?: boolean
}

/**
 * One series' books, loaded a page at a time. The loaded pages are always one contiguous run,
 * normally starting at page 0; {@link jumpTo} can start the run further in, so a long serial
 * opens on the chapter the user is up to, and {@link loadEarlier} then fills in backwards.
 */
export function useSeriesDetail(seriesId: Ref<number | null>) {
  const seriesInfo = ref<SeriesDetail | null>(null)
  const items = ref<BookCard[]>([])
  const total = ref(0)
  const loading = ref(false)
  const loadingEarlier = ref(false)
  const error = ref<string | null>(null)
  const notFound = ref(false)

  const sort = ref<SeriesBookSort>('seriesIndex')
  const order = ref<SortDirection>('asc')
  const libraryId = ref<number | null>(null)
  const readFilter = ref<SeriesBookReadFilter>('all')

  /** Next page to append. */
  const page = ref(0)
  /** First page of the loaded run. */
  const firstPage = ref(0)
  const hasMore = computed(() => firstPage.value * PAGE_SIZE + items.value.length < total.value)
  const hasEarlier = computed(() => firstPage.value > 0)
  /** Position in the whole listing of the first loaded book. */
  const firstIndex = computed(() => firstPage.value * PAGE_SIZE)

  let requestToken = 0

  function queryFor(requestPage: number) {
    return {
      page: requestPage,
      size: PAGE_SIZE,
      sort: sort.value,
      order: order.value,
      libraryId: libraryId.value,
      readState: readFilter.value === 'unread' ? ('unread' as const) : null,
    }
  }

  function applyFailure(err: unknown) {
    if (err instanceof Error && err.message.includes('404')) {
      notFound.value = true
    } else {
      error.value = err instanceof Error ? err.message : 'Failed to load series'
    }
  }

  async function load(input: boolean | LoadOptions = false): Promise<void> {
    const reset = typeof input === 'boolean' ? input : Boolean(input.reset)
    const keepPreviousData = typeof input === 'boolean' ? false : Boolean(input.keepPreviousData)
    const currentSeriesId = seriesId.value
    if (currentSeriesId == null) {
      requestToken++
      loading.value = false
      error.value = null
      notFound.value = true
      page.value = 0
      firstPage.value = 0
      items.value = []
      seriesInfo.value = null
      total.value = 0
      return
    }
    if (!reset && loading.value) return
    if (!reset && !hasMore.value) return
    const requestPage = reset ? 0 : page.value

    const token = ++requestToken
    loading.value = true
    error.value = null

    if (reset) {
      notFound.value = false
      // Kept data stays paired with its own pages until the replacement arrives, so a failed
      // reload cannot leave a jumped run of items labelled as starting at page 0.
      if (!keepPreviousData) {
        page.value = 0
        firstPage.value = 0
        items.value = []
        seriesInfo.value = null
        total.value = 0
      }
    }

    try {
      const data = await fetchSeriesBooks(currentSeriesId, queryFor(requestPage))

      if (token !== requestToken) return

      items.value = reset ? data.items : [...items.value, ...data.items]
      total.value = data.total
      seriesInfo.value = data.seriesInfo
      if (reset) firstPage.value = 0
      page.value = requestPage + 1
    } catch (err) {
      if (token !== requestToken) return
      applyFailure(err)
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  /**
   * Reloads the listing starting at the page that holds `bookId`. Only series order can be
   * anchored, so the caller should switch to it first; the server falls back to page 0 otherwise.
   */
  async function jumpTo(bookId: number): Promise<boolean> {
    const currentSeriesId = seriesId.value
    if (currentSeriesId == null) return false

    const token = ++requestToken
    loading.value = true
    error.value = null

    try {
      const data = await fetchSeriesBooks(currentSeriesId, { ...queryFor(0), anchorBookId: bookId })
      if (token !== requestToken) return false

      const landedPage = Number.isInteger(data.page) && data.page > 0 ? data.page : 0
      items.value = data.items
      total.value = data.total
      seriesInfo.value = data.seriesInfo
      firstPage.value = landedPage
      page.value = landedPage + 1
      return data.items.some((book) => book.id === bookId)
    } catch (err) {
      if (token !== requestToken) return false
      applyFailure(err)
      return false
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  async function loadEarlier(): Promise<number> {
    const currentSeriesId = seriesId.value
    if (currentSeriesId == null || !hasEarlier.value || loading.value || loadingEarlier.value) return 0

    const token = requestToken
    const requestPage = firstPage.value - 1
    loadingEarlier.value = true
    try {
      const data = await fetchSeriesBooks(currentSeriesId, queryFor(requestPage))
      if (token !== requestToken) return 0
      const loadedIds = new Set(items.value.map((book) => book.id))
      const earlier = data.items.filter((book) => !loadedIds.has(book.id))
      items.value = [...earlier, ...items.value]
      total.value = data.total
      firstPage.value = requestPage
      return earlier.length
    } catch (err) {
      if (token !== requestToken) return 0
      error.value = err instanceof Error ? err.message : 'Failed to load series'
      return 0
    } finally {
      loadingEarlier.value = false
    }
  }

  /**
   * Refetches the loaded run of pages in place, so new chapters and read state show up without the
   * list emptying or a jumped run snapping back to page 0. Any load that starts meanwhile wins.
   */
  async function refresh(): Promise<void> {
    const currentSeriesId = seriesId.value
    if (currentSeriesId == null || notFound.value || loading.value || loadingEarlier.value) return
    if (page.value <= firstPage.value) return

    const token = requestToken
    const startPage = firstPage.value
    const endPage = page.value
    try {
      const pages: SeriesBooksPage[] = []
      for (let requestPage = startPage; requestPage < endPage; requestPage++) {
        pages.push(await fetchSeriesBooks(currentSeriesId, queryFor(requestPage)))
        // loadEarlier does not bump the token, so also check the run it would have moved.
        if (token !== requestToken || seriesId.value !== currentSeriesId) return
        if (firstPage.value !== startPage || page.value !== endPage) return
      }
      items.value = [...new Map(pages.flatMap((data) => data.items.map((item) => [item.id, item] as const))).values()]
      const last = pages[pages.length - 1]!
      total.value = last.total
      seriesInfo.value = last.seriesInfo
      error.value = null
    } catch {
      // Keep what is on screen; a failed background refresh should not replace it with an error.
    }
  }

  return {
    seriesInfo,
    items,
    total,
    loading,
    loadingEarlier,
    error,
    notFound,
    hasMore,
    hasEarlier,
    firstIndex,
    sort,
    order,
    libraryId,
    readFilter,
    load,
    jumpTo,
    loadEarlier,
    refresh,
  }
}
