import { useRouter, type HistoryState, type RouteLocationRaw, type Router } from 'vue-router'
import type { BookDetail } from '@bookorbit/types'
import { freshHistoryEntryState } from '@/features/book/composables/useScrollRestoreOnActivate'
import { entryBehindIsInThisDocument } from '../lib/document-history'

type BookSeriesInfo = Pick<BookDetail, 'seriesId' | 'seriesMemberships'>

const ENTERED_BOOK_STATE_KEY = 'readerEnteredBookId'

function primaryMembership(book: Pick<BookDetail, 'seriesMemberships'> | null | undefined) {
  const memberships = book?.seriesMemberships ?? []
  return [...memberships].sort((a, b) => a.displayOrder - b.displayOrder)[0]
}

/** The series a book is read as part of: its first membership, matching how the book pages order them. */
export function primarySeriesId(book: BookSeriesInfo | null | undefined): number | null {
  return primaryMembership(book)?.seriesId ?? book?.seriesId ?? null
}

/** The book's number in the series `primarySeriesId` picks. */
export function primarySeriesIndex(book: Partial<Pick<BookDetail, 'seriesIndex' | 'seriesMemberships'>> | null | undefined): string | null {
  const primary = primaryMembership(book)
  return primary ? primary.seriesIndex : (book?.seriesIndex ?? null)
}

function seriesRow(seriesId: number, bookId: number) {
  return { name: 'series-detail', params: { seriesId }, query: { book: String(bookId) } }
}

/** Where the reader's back arrow leads when going back is not enough: the book's row on its series page. */
export function resolveReaderBackTarget(bookId: number, book: BookSeriesInfo | null | undefined): RouteLocationRaw {
  const seriesId = primarySeriesId(book)
  if (seriesId !== null) return seriesRow(seriesId, bookId)
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

/** True when the in-app page behind the reader is this series' page, shown earlier in this page load. */
function seriesPageIsBehind(router: Router, seriesId: number): boolean {
  const back = (window.history.state as { back?: unknown } | null)?.back
  if (typeof back !== 'string' || !entryBehindIsInThisDocument()) return false
  const behind = router.resolve(back)
  return behind.name === 'series-detail' && Number(behind.params.seriesId) === seriesId
}

/**
 * Goes back to the series page behind the reader and lands it on `target` instead, so history keeps
 * one series page rather than gaining a second. The landed entry starts fresh, as a new visit would.
 */
function returnToSeriesPage(router: Router, seriesId: number, bookId: number) {
  const removeGuard = router.beforeEach((to) => {
    removeGuard()
    if (to.name !== 'series-detail' || Number(to.params.seriesId) !== seriesId) return
    return { ...seriesRow(seriesId, bookId), replace: true, state: freshHistoryEntryState() }
  })
  router.back()
}

/**
 * The reader's back action. Going back returns to the page the reader was opened from, unless the
 * reader has since moved on to another chapter (that page no longer matches what was read) or there
 * is no in-app history (a link opened in a fresh tab); both land on the current chapter's series row,
 * reusing the series page behind the reader when there is one.
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
    const book = getBook()
    const seriesId = primarySeriesId(book)
    if (seriesId !== null && seriesPageIsBehind(router, seriesId)) {
      returnToSeriesPage(router, seriesId, bookId)
      return
    }
    void router.replace(resolveReaderBackTarget(bookId, book))
  }

  return { goBack, handoffState }
}
