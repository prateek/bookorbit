import { useRouter, type HistoryState, type RouteLocationRaw } from 'vue-router'
import type { BookDetail } from '@bookorbit/types'

type BookSeriesInfo = Pick<BookDetail, 'seriesId' | 'seriesMemberships'>

const ENTERED_BOOK_STATE_KEY = 'readerEnteredBookId'

/** The series a book is read as part of: its first membership, matching how the book pages order them. */
export function primarySeriesId(book: BookSeriesInfo | null | undefined): number | null {
  const memberships = book?.seriesMemberships ?? []
  const primary = [...memberships].sort((a, b) => a.displayOrder - b.displayOrder)[0]
  return primary?.seriesId ?? book?.seriesId ?? null
}

/** Where the reader's back arrow leads when going back is not enough: the book's row on its series page. */
export function resolveReaderBackTarget(bookId: number, book: BookSeriesInfo | null | undefined): RouteLocationRaw {
  const seriesId = primarySeriesId(book)
  if (seriesId !== null) return { name: 'series-detail', params: { seriesId }, query: { book: String(bookId) } }
  return { name: 'book-detail', params: { bookId } }
}

/** True when the router recorded an in-app page before this one (absent for a link opened in a fresh tab). */
export function hasInAppHistory(): boolean {
  const state = window.history.state as { back?: unknown } | null
  return state?.back != null
}

/**
 * The book this reader visit started on. Opening the next chapter replaces the history entry and
 * remounts the reader, so the starting book rides along in history state rather than in memory.
 */
export function enteredReaderBookId(currentBookId: number): number {
  const state = window.history.state as Record<string, unknown> | null
  const value = state?.[ENTERED_BOOK_STATE_KEY]
  return typeof value === 'number' ? value : currentBookId
}

/**
 * The reader's back action. Going back returns to the page the reader was opened from, unless the
 * reader has since moved on to another chapter (that page no longer matches what was read) or there
 * is no in-app history (a link opened in a fresh tab); both land on the current chapter's series row.
 */
export function useReaderBack(bookId: number, getBook: () => BookSeriesInfo | null | undefined) {
  const router = useRouter()
  const enteredBookId = enteredReaderBookId(bookId)

  /** History state for a `router.replace` to another chapter that keeps this visit's starting book. */
  function handoffState(): HistoryState {
    return { [ENTERED_BOOK_STATE_KEY]: enteredBookId }
  }

  function goBack() {
    if (enteredBookId === bookId && hasInAppHistory()) {
      router.back()
      return
    }
    void router.replace(resolveReaderBackTarget(bookId, getBook()))
  }

  return { goBack, handoffState }
}
