import { useRouter, type RouteLocationRaw } from 'vue-router'
import type { BookDetail } from '@bookorbit/types'

type BookSeriesInfo = Pick<BookDetail, 'seriesId' | 'seriesMemberships'>

/** The series a book is read as part of: its first membership, matching how the book pages order them. */
export function primarySeriesId(book: BookSeriesInfo | null | undefined): number | null {
  const memberships = book?.seriesMemberships ?? []
  const primary = [...memberships].sort((a, b) => a.displayOrder - b.displayOrder)[0]
  return primary?.seriesId ?? book?.seriesId ?? null
}

/** Where the reader's back arrow leads when there is no in-app page to return to. */
export function resolveReaderBackTarget(bookId: number, book: BookSeriesInfo | null | undefined): RouteLocationRaw {
  const seriesId = primarySeriesId(book)
  if (seriesId !== null) return { name: 'series-detail', params: { seriesId } }
  return { name: 'book-detail', params: { bookId } }
}

/** True when the router recorded an in-app page before this one (absent for a link opened in a fresh tab). */
export function hasInAppHistory(): boolean {
  const state = window.history.state as { back?: unknown } | null
  return state?.back != null
}

/**
 * The reader's back action. A reader opened from a notification or shared link in a fresh tab has
 * no history, so `router.back()` would do nothing; it lands on the book's series or detail page.
 */
export function useReaderBack(bookId: number, getBook: () => BookSeriesInfo | null | undefined) {
  const router = useRouter()

  function goBack() {
    if (hasInAppHistory()) {
      router.back()
      return
    }
    void router.replace(resolveReaderBackTarget(bookId, getBook()))
  }

  return { goBack }
}
