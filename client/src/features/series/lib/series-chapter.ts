import { READER_OPENABLE_FORMATS, type BookCard, type BookFileRef } from '@bookorbit/types'

export type ChapterReadState = 'read' | 'reading' | 'unread'

export function chapterReadState(book: BookCard): ChapterReadState {
  const status = book.readStatus?.status
  if (status === 'read') return 'read'
  if (status === 'reading' || status === 'rereading') return 'reading'
  if ((book.readingProgress ?? 0) > 0) return 'reading'
  return 'unread'
}

/** The file a tap on a chapter should open: the primary readable file, else the first one. */
export function chapterReaderFile(book: BookCard): BookFileRef | null {
  const readable = book.files.filter((file) => {
    const format = file.format?.trim().toLowerCase()
    return format ? READER_OPENABLE_FORMATS.has(format) : false
  })
  return readable.find((file) => file.role === 'primary') ?? readable[0] ?? null
}

/** Whole-number percent (the card carries 0-100) for a chapter in progress, or null. */
export function chapterProgressPercent(book: BookCard): number | null {
  const progress = book.readingProgress
  if (progress == null || progress <= 0 || chapterReadState(book) !== 'reading') return null
  return Math.min(99, Math.max(1, Math.round(progress)))
}
