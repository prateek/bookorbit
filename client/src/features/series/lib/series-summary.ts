import type { SeriesSummary, SeriesVolumeSlot } from '@bookorbit/types'

/**
 * What a row actually shows, derived once so the grid card and the list row can never
 * disagree about a series.
 *
 * The volume counts come from the ladder rather than from `bookCount`, because a library holding
 * the same volume twice - one ebook, one audiobook - owns two books and one volume, and "3 of 7"
 * only reads correctly when it counts volumes. When there is no ladder to count, or the ladder is
 * cut short (`volumesTruncated`), the book counts stand in: a capped ladder only holds its first
 * rungs, so counting it would report "0/60" for a series of 89.
 */
export type SeriesRowFacts = {
  ownedVolumes: number
  readVolumes: number
  readingVolumes: number
  percentRead: number
  isComplete: boolean
  isStarted: boolean
  isSingleVolume: boolean
  hasGaps: boolean
  /** True when the ladder is a real ladder of numbered rungs rather than a flat run of books. */
  isNumbered: boolean
}

export function seriesRowFacts(series: SeriesSummary): SeriesRowFacts {
  const slots = series.volumes
  const countLadder = slots.length > 0 && !series.volumesTruncated
  const owned = countLadder ? slots.filter((slot) => slot.bookId !== null).length : series.bookCount
  const read = countLadder ? slots.filter((slot) => slot.status === 'read').length : series.readCount
  const reading = countLadder ? slots.filter((slot) => slot.status === 'reading').length : series.readingCount

  return {
    ownedVolumes: owned,
    readVolumes: read,
    readingVolumes: reading,
    percentRead: owned > 0 ? Math.round((read / owned) * 100) : 0,
    isComplete: owned > 0 && read === owned,
    isStarted: read > 0 || reading > 0,
    isSingleVolume: owned === 1,
    hasGaps: series.gapCount > 0,
    isNumbered: slots.some((slot) => slot.index !== null),
  }
}

/** Books the user has not marked read. Counts books rather than volumes, like the server does. */
export function seriesUnreadCount(series: SeriesSummary): number {
  return Math.max(0, series.bookCount - series.readCount)
}

/**
 * Message key for the word in front of the up-next volume. "Reading" only when that volume is
 * itself in progress: a stale in-progress mark on an earlier volume does not make the next one so.
 */
export function seriesNextKickerKey(facts: SeriesRowFacts, nextStatus?: SeriesSummary['nextStatus']): string {
  if (facts.isComplete) return 'series.index.finished'
  if (nextStatus === 'reading') return 'series.index.reading'
  if (nextStatus == null && facts.readingVolumes > 0) return 'series.index.reading'
  return facts.readVolumes > 0 || facts.readingVolumes > 0 ? 'series.index.next' : 'series.index.start'
}

/** "#12 · Title" for the up-next volume, or null when there is nothing left to open. */
export function seriesNextValue(series: SeriesSummary, facts: SeriesRowFacts): string | null {
  if (facts.isComplete || !series.nextTitle) return null
  const number = series.nextIndex ? `#${series.nextIndex}` : null
  return [number, series.nextTitle].filter(Boolean).join(' · ')
}

/** Volumes that have a cover to show, in series order. Missing rungs hold no book. */
export function seriesCoverSlots(series: SeriesSummary): SeriesVolumeSlot[] {
  const present = series.volumes.filter((slot) => slot.bookId !== null)
  if (present.length > 0) return present
  // A ladder we could not build still has covers worth showing.
  return series.coverBookIds.map((bookId) => ({ index: null, bookId, title: null, status: 'unread' as const }))
}

export function seriesAuthorLine(series: SeriesSummary): string | null {
  const authors = series.authors
  if (authors.length === 0) return null
  if (authors.length <= 2) return authors.join(', ')
  return `${authors[0]}, ${authors[1]}`
}

/** Authors beyond the two the line names, for a "+2" suffix the caller can translate. */
export function seriesExtraAuthorCount(series: SeriesSummary): number {
  return Math.max(0, series.authors.length - 2)
}

/**
 * `lastAddedAt` arrives as a Postgres timestamp - `2026-08-15 04:35:41.046562+00` - which is not
 * ISO 8601 on two counts: a space instead of `T`, and a two-digit UTC offset where ISO wants
 * `+00:00`. `new Date()` rejects it outright in some engines and silently mis-parses in others,
 * so it is normalised here rather than at each call site.
 */
export function parseAddedAt(value: string | null): Date | null {
  if (!value) return null
  const normalized = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
