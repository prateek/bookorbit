import { describe, expect, it } from 'vitest'
import type { RelatedSeriesCard } from '@bookorbit/types'

import { i18n } from '@/i18n'
import { relatedSeriesCaption } from '../related-shelf'

function card(overrides: Partial<RelatedSeriesCard> = {}): RelatedSeriesCard {
  return {
    kind: 'series',
    seriesId: 1,
    name: 'Chrysalis',
    authors: [],
    bookCount: 1800,
    readCount: 0,
    readingCount: 0,
    isSerial: true,
    coverBookId: 5,
    coverUpdatedAt: null,
    hasCover: false,
    coverAspectRatio: '2/3',
    ...overrides,
  }
}

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {})

describe('relatedSeriesCaption', () => {
  it('counts chapters for a serial and books otherwise', () => {
    expect(relatedSeriesCaption(card(), t)).toBe('1,800 chapters')
    expect(relatedSeriesCaption(card({ isSerial: false, bookCount: 3 }), t)).toBe('3 books')
  })

  it('says how far the reader is into the series', () => {
    expect(relatedSeriesCaption(card({ readCount: 40 }), t)).toBe('1,800 chapters · 40 read')
    expect(relatedSeriesCaption(card({ readingCount: 1 }), t)).toBe('1,800 chapters · started')
    expect(relatedSeriesCaption(card({ bookCount: 2, readCount: 2 }), t)).toBe('2 chapters · all read')
  })
})
