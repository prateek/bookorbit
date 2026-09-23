import { ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

type BackTarget = { bookId: number; seriesId: number | null; libraryId: number | null }

// The header sits outside the tab that loads the book, so the tab publishes where "back" should lead
// when the page was opened without in-app history (deep link, Home Screen launch, reload).
const current = ref<BackTarget | null>(null)

export function setBookDetailBackTarget(target: BackTarget) {
  current.value = target
}

export function bookDetailBackFallback(bookId: number): RouteLocationRaw {
  const target = current.value?.bookId === bookId ? current.value : null
  if (target?.seriesId != null) return { name: 'series-detail', params: { seriesId: target.seriesId } }
  if (target?.libraryId != null) return { name: 'library', params: { id: target.libraryId } }
  return { name: 'dashboard' }
}
