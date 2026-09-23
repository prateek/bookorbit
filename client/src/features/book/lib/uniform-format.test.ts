import { describe, expect, it } from 'vitest'
import type { BookCard, BookFileRef } from '@bookorbit/types'
import type { BookSlot } from '../composables/useBookWindow'
import { hasUniformFormat } from './uniform-format'

let nextId = 1

function book(formats: Array<string | null>, extra: Partial<BookCard> = {}): BookCard {
  const files: BookFileRef[] = formats.map((format, index) => ({
    id: nextId++,
    format,
    role: index === 0 ? 'primary' : 'content',
    sizeBytes: null,
  }))
  return { id: nextId++, files, ...extra } as BookCard
}

describe('hasUniformFormat', () => {
  it('is true when every book has one file of the same format', () => {
    expect(hasUniformFormat([book(['epub']), book(['EPUB']), book(['epub', 'epub'])])).toBe(true)
  })

  it('is false when books differ in format', () => {
    expect(hasUniformFormat([book(['epub']), book(['pdf'])])).toBe(false)
  })

  it('is false when a single book carries two formats', () => {
    expect(hasUniformFormat([book(['epub']), book(['epub', 'm4b'])])).toBe(false)
  })

  it('is false when a read-along EPUB would show its own badge', () => {
    const readAlong = book(['epub'])
    readAlong.files[0]!.mediaOverlay = { available: true, durationSeconds: 42 }

    expect(hasUniformFormat([book(['epub']), readAlong])).toBe(false)
  })

  it('ignores placeholders, collapsed series and fileless books', () => {
    const slots: BookSlot[] = [
      { id: -1, placeholder: true },
      book(['epub']),
      book([]),
      book([null]),
      book(['pdf'], { collapsedSeries: { bookCount: 3, readCount: 0, coverBookIds: [] } as unknown as BookCard['collapsedSeries'] }),
      book(['epub']),
    ]

    expect(hasUniformFormat(slots)).toBe(true)
  })

  it('is false when nothing in the list shows a badge', () => {
    expect(hasUniformFormat([])).toBe(false)
    expect(hasUniformFormat([{ id: -1, placeholder: true }, book([])])).toBe(false)
  })
})
