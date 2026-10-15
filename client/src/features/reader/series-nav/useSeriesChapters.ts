import { computed, onBeforeUnmount, ref } from 'vue'
import type { BookCard } from '@bookorbit/types'
import { fetchSeriesBooks } from '@/features/series/api/series'

export const SERIES_CHAPTERS_PAGE_SIZE = 50

/**
 * A window of one series' chapters around the chapter being read, in series order. It opens on the
 * page that holds that chapter and grows a page at a time in either direction, so a serial of
 * thousands of chapters is never loaded whole.
 */
export function useSeriesChapters(seriesId: number, bookId: number) {
  const items = ref<BookCard[]>([])
  const seriesName = ref<string | null>(null)
  const total = ref(0)
  const loading = ref(false)
  const loadingEarlier = ref(false)
  const loadingLater = ref(false)
  const failed = ref(false)

  /** First page of the loaded run. */
  const firstPage = ref(0)
  /** Page after the loaded run. */
  const nextPage = ref(0)
  const hasEarlier = computed(() => firstPage.value > 0)
  const hasLater = computed(() => nextPage.value * SERIES_CHAPTERS_PAGE_SIZE < total.value)

  // A page that lands after the listing was reloaded, or after the panel closed, is dropped.
  let token = 0
  onBeforeUnmount(() => {
    token++
  })

  function pageQuery(page: number) {
    return { page, size: SERIES_CHAPTERS_PAGE_SIZE, sort: 'seriesIndex' as const, order: 'asc' as const }
  }

  function unseen(books: BookCard[]): BookCard[] {
    const loaded = new Set(items.value.map((book) => book.id))
    return books.filter((book) => !loaded.has(book.id))
  }

  async function load(): Promise<void> {
    const started = ++token
    loading.value = true
    loadingEarlier.value = false
    loadingLater.value = false
    failed.value = false
    try {
      const data = await fetchSeriesBooks(seriesId, { ...pageQuery(0), anchorBookId: bookId })
      if (started !== token) return
      const landed = Number.isInteger(data.page) && data.page > 0 ? data.page : 0
      items.value = data.items
      total.value = data.total
      seriesName.value = data.seriesInfo?.name ?? null
      firstPage.value = landed
      nextPage.value = landed + 1
    } catch {
      if (started === token) failed.value = true
    } finally {
      if (started === token) loading.value = false
    }
  }

  async function loadEarlier(): Promise<void> {
    if (!hasEarlier.value || loading.value || loadingEarlier.value) return
    const started = token
    const page = firstPage.value - 1
    loadingEarlier.value = true
    try {
      const data = await fetchSeriesBooks(seriesId, pageQuery(page))
      if (started !== token) return
      items.value = [...unseen(data.items), ...items.value]
      total.value = data.total
      firstPage.value = page
    } catch {
      // The button stays, so the reader can ask again.
    } finally {
      if (started === token) loadingEarlier.value = false
    }
  }

  async function loadLater(): Promise<void> {
    if (!hasLater.value || loading.value || loadingLater.value) return
    const started = token
    const page = nextPage.value
    loadingLater.value = true
    try {
      const data = await fetchSeriesBooks(seriesId, pageQuery(page))
      if (started !== token) return
      items.value = [...items.value, ...unseen(data.items)]
      total.value = data.total
      nextPage.value = page + 1
    } catch {
      // The button stays, so the reader can ask again.
    } finally {
      if (started === token) loadingLater.value = false
    }
  }

  return { items, seriesName, total, loading, loadingEarlier, loadingLater, failed, hasEarlier, hasLater, load, loadEarlier, loadLater }
}
