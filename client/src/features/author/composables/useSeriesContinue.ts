import { ref } from 'vue'
import { useRouter } from 'vue-router'

import type { BookCard } from '@bookorbit/types'
import { fetchSeriesBooks } from '@/features/series/api/series'

/**
 * Opens the chapter a reader should pick a collapsed series back up at. The series endpoint
 * resolves that target by the same rule as the series page's Continue button (the furthest
 * chapter in progress, else the first unread after the furthest read one) and down to a file,
 * so a tap goes straight into the reader. Without a file, or when the lookup fails, it falls
 * back to the first unread chapter's detail page.
 */
export function useSeriesContinue() {
  const router = useRouter()
  const continuingSeriesId = ref<number | null>(null)

  function openDetail(bookId: number) {
    void router.push({ name: 'book-detail', params: { bookId } })
  }

  async function continueSeries(book: BookCard): Promise<void> {
    const fallbackBookId = book.collapsedSeries?.firstUnreadBookId ?? book.collapsedSeries?.latestVolumeBookId ?? book.id
    const seriesId = book.seriesId
    if (seriesId == null) {
      openDetail(fallbackBookId)
      return
    }
    if (continuingSeriesId.value !== null) return

    continuingSeriesId.value = seriesId
    try {
      const page = await fetchSeriesBooks(seriesId, { page: 0, size: 1, sort: 'seriesIndex', order: 'asc' })
      const next = page.seriesInfo.next
      if (next?.fileId != null) {
        await router.push({ name: 'reader', params: { bookId: next.bookId, fileId: next.fileId }, query: { format: next.format ?? 'epub' } })
        return
      }
      openDetail(next?.bookId ?? fallbackBookId)
    } catch {
      openDetail(fallbackBookId)
    } finally {
      continuingSeriesId.value = null
    }
  }

  return { continuingSeriesId, continueSeries }
}
