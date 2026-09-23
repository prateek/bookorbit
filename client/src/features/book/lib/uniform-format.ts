import type { BookCard } from '@bookorbit/types'
import { isBookPlaceholder, type BookSlot } from '../composables/useBookWindow'
import { hasReadAlong } from './file-capabilities'

const MIXED = Symbol('mixed')

function singleFormatOf(book: BookCard): string | null | typeof MIXED {
  let format: string | null = null
  for (const file of book.files) {
    if (!file.format) continue
    if (hasReadAlong(file)) return MIXED
    const normalized = file.format.trim().toLowerCase()
    if (format !== null && format !== normalized) return MIXED
    format = normalized
  }
  return format
}

/**
 * True when every loaded book in a list carries exactly one and the same file format, so a
 * per-card format badge would repeat the same word on every item. Placeholders, collapsed series
 * and fileless books show no badge and do not count either way.
 */
export function hasUniformFormat(books: Iterable<BookSlot>): boolean {
  let shared: string | null = null
  for (const slot of books) {
    if (!slot || isBookPlaceholder(slot) || slot.collapsedSeries) continue
    const format = singleFormatOf(slot)
    if (format === MIXED) return false
    if (format === null) continue
    if (shared !== null && shared !== format) return false
    shared = format
  }
  return shared !== null
}
