import type { HistoryState, RouteLocationRaw } from 'vue-router'
import type { BookCard, SeriesNextBook } from '@bookorbit/types'
import { chapterReaderFile } from '@/features/series/lib/series-chapter'
import type { TocItem } from '../epub/composables/useToc'

export type SeriesChapterTarget = Pick<SeriesNextBook, 'bookId' | 'fileId' | 'format'>

function countTocEntries(items: TocItem[]): number {
  return items.reduce((count, item) => count + 1 + countTocEntries(item.subitems ?? []), 0)
}

/**
 * The series whose chapters the chapter panel lists in place of the book's own contents. A serial
 * chapter file usually has a contents list of one entry, which says nothing; a real one is kept.
 */
export function chapterPanelSeriesId(toc: TocItem[], seriesId: number | null): number | null {
  if (seriesId === null) return null
  return countTocEntries(toc) <= 1 ? seriesId : null
}

/** The file a chapter row opens, or null when the chapter has nothing this reader can open. */
export function seriesChapterTarget(book: BookCard): SeriesChapterTarget | null {
  const file = chapterReaderFile(book)
  if (!file) return null
  return { bookId: book.id, fileId: file.id, format: file.format ?? 'epub' }
}

/**
 * Opens another chapter the way "Next chapter" does: the current history entry is replaced and
 * carries the reader visit's starting book, and no reading mode is passed on, so a finished chapter
 * opens as a peek and an unread one is tracked.
 */
export function readerRouteForChapter(target: SeriesChapterTarget, state: HistoryState): RouteLocationRaw {
  return {
    name: 'reader',
    params: { bookId: target.bookId, fileId: target.fileId },
    query: { format: target.format },
    state,
  }
}
