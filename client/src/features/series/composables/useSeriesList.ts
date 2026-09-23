import { computed, ref } from 'vue'

import type { SeriesFacets, SeriesPage, SeriesSummary } from '@bookorbit/types'
import { fetchSeries } from '../api/series'
import type { CompletionStatus, SeriesListSort, SortDirection } from '../types/series'

const PAGE_SIZE = 50

const EMPTY_FACETS: SeriesFacets = { all: 0, notStarted: 0, inProgress: 0, complete: 0, hasGaps: 0 }

export function useSeriesList() {
  const items = ref<SeriesSummary[]>([])
  const total = ref(0)
  const facets = ref<SeriesFacets>({ ...EMPTY_FACETS })
  const loading = ref(false)
  const error = ref<string | null>(null)

  const q = ref('')
  const sort = ref<SeriesListSort>('name')
  const order = ref<SortDirection>('asc')
  const libraryId = ref<number | null>(null)
  const completionStatus = ref<CompletionStatus | null>(null)
  const author = ref<string | null>(null)

  const page = ref(0)
  const hasMore = computed(() => items.value.length < total.value)

  let requestToken = 0

  function currentQuery() {
    return {
      q: q.value.trim() || undefined,
      size: PAGE_SIZE,
      sort: sort.value,
      order: order.value,
      libraryId: libraryId.value,
      completionStatus: completionStatus.value,
      author: author.value?.trim() || undefined,
    }
  }

  async function load(reset = false): Promise<void> {
    if (!reset && loading.value) return
    if (!reset && !hasMore.value) return

    const token = ++requestToken
    loading.value = true
    error.value = null

    const requestPage = reset ? 0 : page.value
    if (reset) {
      page.value = 0
      items.value = []
    }

    try {
      const data = await fetchSeries({ ...currentQuery(), page: requestPage })

      if (token !== requestToken) return

      items.value = reset ? data.items : [...items.value, ...data.items]
      total.value = data.total
      facets.value = data.facets ?? { ...EMPTY_FACETS }
      page.value = requestPage + 1
    } catch (err) {
      if (token !== requestToken) return
      error.value = err instanceof Error ? err.message : 'Failed to load series'
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  /**
   * Refetches every page already loaded and swaps them in together, so the list picks up changes
   * without emptying first and losing the reader's scroll position. Any load that starts meanwhile
   * wins and the refreshed pages are dropped.
   */
  async function refresh(): Promise<void> {
    if (loading.value || page.value === 0) return
    const token = requestToken
    const pageCount = page.value
    try {
      const pages: SeriesPage[] = []
      for (let requestPage = 0; requestPage < pageCount; requestPage++) {
        pages.push(await fetchSeries({ ...currentQuery(), page: requestPage }))
        if (token !== requestToken) return
      }
      items.value = [...new Map(pages.flatMap((data) => data.items.map((item) => [item.id, item] as const))).values()]
      const last = pages[pages.length - 1]!
      total.value = last.total
      facets.value = last.facets ?? { ...EMPTY_FACETS }
      error.value = null
    } catch {
      // The list on screen is still valid; a failed background refresh should not replace it with an error.
    }
  }

  return {
    items,
    total,
    facets,
    loading,
    error,
    hasMore,
    q,
    sort,
    order,
    libraryId,
    completionStatus,
    author,
    load,
    refresh,
  }
}
