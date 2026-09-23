import type { RelatedSeriesCard, RelatedShelfItem } from '@bookorbit/types'

import type { CarouselBook } from './BookCarousel.vue'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** "1,089 chapters · 40 read": how big the series is and how far the reader is into it. */
export function relatedSeriesCaption(card: RelatedSeriesCard, t: Translate): string {
  const size = t(card.isSerial ? 'book.detail.discover.chapterCount' : 'book.detail.discover.bookCount', { count: card.bookCount })
  if (card.bookCount > 0 && card.readCount >= card.bookCount) return `${size} · ${t('book.detail.discover.allRead')}`
  if (card.readCount > 0) return `${size} · ${t('book.detail.discover.readCount', { count: card.readCount })}`
  if (card.readingCount > 0) return `${size} · ${t('book.detail.discover.started')}`
  return size
}

export function relatedShelfCard(item: RelatedShelfItem, t: Translate): CarouselBook {
  if (item.kind === 'book') return item
  return {
    key: `series-${item.seriesId}`,
    id: item.coverBookId,
    title: item.name,
    coverAspectRatio: item.coverAspectRatio,
    updatedAt: item.coverUpdatedAt,
    hasCover: item.hasCover,
    authors: item.authors,
    isAudiobook: item.isAudiobook,
    isComic: item.isComic,
    to: { name: 'series-detail', params: { seriesId: item.seriesId } },
    caption: relatedSeriesCaption(item, t),
  }
}

function itemKey(item: RelatedShelfItem): string {
  return item.kind === 'series' ? `series-${item.seriesId}` : `book-${item.id}`
}

/** The similar shelf without anything the author shelf already shows. */
export function withoutItemsIn(items: RelatedShelfItem[], shown: RelatedShelfItem[]): RelatedShelfItem[] {
  if (shown.length === 0) return items
  const shownKeys = new Set(shown.map(itemKey))
  return items.filter((item) => !shownKeys.has(itemKey(item)))
}
