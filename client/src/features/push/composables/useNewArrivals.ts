import { computed, ref } from 'vue'
import type { BookCard, NewArrivalsPage } from '@bookorbit/types'
import { chapterReaderFile } from '@/features/series/lib/series-chapter'
import { api } from '@/lib/api'

const PAGE_SIZE = 50

export function useNewArrivals(token: string) {
  const page = ref<NewArrivalsPage | null>(null)
  const loading = ref(false)
  const error = ref<'unavailable' | 'failed' | null>(null)
  const offset = ref(0)
  let requestedOffset = 0
  const hasPrevious = computed(() => offset.value > 0)

  async function load(nextOffset = offset.value) {
    if (loading.value) return
    requestedOffset = nextOffset
    loading.value = true
    error.value = null
    try {
      const response = await api(`/api/v1/push/arrivals/${encodeURIComponent(token)}?limit=${PAGE_SIZE}&offset=${nextOffset}`)
      if (!response.ok) {
        error.value = response.status === 404 ? 'unavailable' : 'failed'
        return
      }
      page.value = (await response.json()) as NewArrivalsPage
      offset.value = nextOffset
    } catch {
      error.value = 'failed'
    } finally {
      loading.value = false
    }
  }

  function next() {
    return load(offset.value + PAGE_SIZE)
  }
  function previous() {
    return load(Math.max(0, offset.value - PAGE_SIZE))
  }
  function retry() {
    return load(requestedOffset)
  }

  function readerUrl(book: BookCard) {
    const file = chapterReaderFile(book)
    return file ? `/read/${book.id}/${file.id}?format=${(file.format ?? '').trim().toLowerCase()}` : `/book/${book.id}`
  }

  return { page, loading, error, hasPrevious, load, next, previous, retry, readerUrl }
}
