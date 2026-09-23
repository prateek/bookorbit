// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SeriesSummary, SeriesVolumeSlot } from '@bookorbit/types'
import {
  parseAddedAt,
  seriesAuthorLine,
  seriesCoverSlots,
  seriesExtraAuthorCount,
  seriesNextKickerKey,
  seriesNextValue,
  seriesRowFacts,
  seriesUnreadCount,
} from './series-summary'

function slot(overrides: Partial<SeriesVolumeSlot> = {}): SeriesVolumeSlot {
  return { index: 1, bookId: 1, title: 'One', status: 'unread', ...overrides }
}

function summary(overrides: Partial<SeriesSummary> = {}): SeriesSummary {
  return {
    id: 1,
    name: 'Series',
    bookCount: 1,
    readCount: 0,
    readingCount: 0,
    authors: [],
    coverBookIds: [],
    lastAddedAt: null,
    libraryNames: [],
    expectedBookCount: null,
    volumes: [],
    volumesTruncated: false,
    gaps: [],
    gapCount: 0,
    nextBookId: null,
    nextIndex: null,
    nextTitle: null,
    ...overrides,
  }
}

describe('seriesRowFacts', () => {
  it('counts volumes off the ladder, so two editions of one volume count once', () => {
    const facts = seriesRowFacts(
      summary({
        bookCount: 4,
        readCount: 1,
        volumes: [slot({ index: 1, bookId: 1, status: 'read' }), slot({ index: 2, bookId: 2, status: 'unread' })],
      }),
    )

    expect(facts.ownedVolumes).toBe(2)
    expect(facts.readVolumes).toBe(1)
    expect(facts.percentRead).toBe(50)
  })

  it('does not count a missing rung as something the library owns', () => {
    const facts = seriesRowFacts(
      summary({
        bookCount: 2,
        volumes: [
          slot({ index: 1, bookId: 1, status: 'read' }),
          slot({ index: 2, bookId: null, title: null, status: 'missing' }),
          slot({ index: 3, bookId: 3, status: 'unread' }),
        ],
        gaps: [2],
        gapCount: 1,
      }),
    )

    expect(facts.ownedVolumes).toBe(2)
    expect(facts.hasGaps).toBe(true)
    expect(facts.isComplete).toBe(false)
  })

  it('falls back to the book counts when there is no ladder to count', () => {
    const facts = seriesRowFacts(summary({ bookCount: 9, readCount: 4, readingCount: 1, volumes: [], volumesTruncated: true }))

    expect(facts.ownedVolumes).toBe(9)
    expect(facts.readVolumes).toBe(4)
    expect(facts.readingVolumes).toBe(1)
  })

  it('uses the true book counts when the ladder is capped short of the whole series', () => {
    const capped = Array.from({ length: 60 }, (_, i) => slot({ index: i + 1, bookId: i + 1, status: i < 50 ? 'read' : 'unread' }))
    const facts = seriesRowFacts(summary({ bookCount: 89, readCount: 70, readingCount: 1, volumes: capped, volumesTruncated: true }))

    expect(facts.ownedVolumes).toBe(89)
    expect(facts.readVolumes).toBe(70)
    expect(facts.readingVolumes).toBe(1)
    expect(facts.percentRead).toBe(79)
    expect(facts.isComplete).toBe(false)
  })

  it('is complete only when every owned volume is read', () => {
    const read = [slot({ index: 1, bookId: 1, status: 'read' }), slot({ index: 2, bookId: 2, status: 'read' })]
    expect(seriesRowFacts(summary({ volumes: read })).isComplete).toBe(true)
    expect(seriesRowFacts(summary({ volumes: [], bookCount: 0, readCount: 0 })).isComplete).toBe(false)
  })
})

describe('up next', () => {
  it('names the next volume by number and title until the series is finished', () => {
    const inProgress = summary({ bookCount: 89, readCount: 40, nextBookId: 41, nextIndex: '41', nextTitle: 'Forty-one', volumesTruncated: true })
    expect(seriesNextValue(inProgress, seriesRowFacts(inProgress))).toBe('#41 · Forty-one')
    expect(seriesNextKickerKey(seriesRowFacts(inProgress))).toBe('series.index.next')

    const done = summary({ bookCount: 2, readCount: 2, nextTitle: 'Stale' })
    expect(seriesNextValue(done, seriesRowFacts(done))).toBeNull()
  })

  it('says "reading" only when the next volume itself is in progress', () => {
    const staleReading = seriesRowFacts(summary({ bookCount: 600, readCount: 500, readingCount: 1, volumesTruncated: true }))
    expect(seriesNextKickerKey(staleReading, 'unread')).toBe('series.index.next')
    expect(seriesNextKickerKey(staleReading, 'reading')).toBe('series.index.reading')

    const onlyReading = seriesRowFacts(summary({ bookCount: 10, readCount: 0, readingCount: 1, volumesTruncated: true }))
    expect(seriesNextKickerKey(onlyReading, 'unread')).toBe('series.index.next')

    const fresh = seriesRowFacts(summary({ bookCount: 10, readCount: 0, readingCount: 0, volumesTruncated: true }))
    expect(seriesNextKickerKey(fresh, 'unread')).toBe('series.index.start')
  })

  it('counts unread books from the true totals, not the capped ladder', () => {
    expect(seriesUnreadCount(summary({ bookCount: 1700, readCount: 500 }))).toBe(1200)
    expect(seriesUnreadCount(summary({ bookCount: 3, readCount: 3 }))).toBe(0)
  })
})

describe('seriesCoverSlots', () => {
  it('drops missing rungs, which have no cover to show', () => {
    const slots = seriesCoverSlots(
      summary({ volumes: [slot({ index: 1, bookId: 1 }), slot({ index: 2, bookId: null, status: 'missing' }), slot({ index: 3, bookId: 3 })] }),
    )

    expect(slots.map((s) => s.bookId)).toEqual([1, 3])
  })

  it('falls back to the cover ids when the ladder could not be built', () => {
    const slots = seriesCoverSlots(summary({ volumes: [], coverBookIds: [7, 8] }))
    expect(slots.map((s) => s.bookId)).toEqual([7, 8])
  })
})

describe('seriesAuthorLine', () => {
  it('names up to two authors and counts the rest', () => {
    expect(seriesAuthorLine(summary({ authors: [] }))).toBeNull()
    expect(seriesAuthorLine(summary({ authors: ['A'] }))).toBe('A')
    expect(seriesAuthorLine(summary({ authors: ['A', 'B', 'C', 'D'] }))).toBe('A, B')
    expect(seriesExtraAuthorCount(summary({ authors: ['A', 'B', 'C', 'D'] }))).toBe(2)
  })
})

describe('parseAddedAt', () => {
  it('parses the Postgres timestamp shape the API actually returns', () => {
    // Space separator and a two-digit offset; neither is ISO 8601.
    const parsed = parseAddedAt('2026-08-15 04:35:41.046562+00')
    expect(parsed).not.toBeNull()
    expect(parsed!.toISOString()).toBe('2026-08-15T04:35:41.046Z')
  })

  it('handles a non-UTC two-digit offset', () => {
    expect(parseAddedAt('2026-08-15 04:35:41+02')!.toISOString()).toBe('2026-08-15T02:35:41.000Z')
  })

  it('still accepts a proper ISO string', () => {
    expect(parseAddedAt('2026-08-15T04:35:41.000Z')!.toISOString()).toBe('2026-08-15T04:35:41.000Z')
  })

  it('returns null rather than an Invalid Date', () => {
    expect(parseAddedAt(null)).toBeNull()
    expect(parseAddedAt('not a date')).toBeNull()
  })
})
