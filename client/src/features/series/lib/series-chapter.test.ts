// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { BookCard, BookFileRef } from '@bookorbit/types'
import { chapterProgressPercent, chapterReadState, chapterReaderFile } from './series-chapter'

function book(overrides: Partial<BookCard> = {}): BookCard {
  return { id: 1, files: [], readStatus: null, readingProgress: null, ...overrides } as BookCard
}

function file(overrides: Partial<BookFileRef>): BookFileRef {
  return { id: 1, format: 'epub', role: 'content', sizeBytes: null, ...overrides }
}

function status(value: string) {
  return { status: value, source: 'manual', startedAt: null, finishedAt: null, updatedAt: '' } as BookCard['readStatus']
}

describe('chapterReadState', () => {
  it('reads the explicit status first and treats progress without one as in progress', () => {
    expect(chapterReadState(book({ readStatus: status('read'), readingProgress: 40 }))).toBe('read')
    expect(chapterReadState(book({ readStatus: status('reading') }))).toBe('reading')
    expect(chapterReadState(book({ readingProgress: 12 }))).toBe('reading')
    expect(chapterReadState(book())).toBe('unread')
  })
})

describe('chapterReaderFile', () => {
  it('prefers the primary readable file and skips formats the reader cannot open', () => {
    const files = [file({ id: 1, format: 'zip' }), file({ id: 2, format: 'EPUB' }), file({ id: 3, format: 'pdf', role: 'primary' })]
    expect(chapterReaderFile(book({ files }))?.id).toBe(3)
    expect(chapterReaderFile(book({ files: [file({ id: 4, format: 'zip' })] }))).toBeNull()
  })
})

describe('chapterProgressPercent', () => {
  it('shows progress only for a chapter in progress', () => {
    expect(chapterProgressPercent(book({ readingProgress: 42.4 }))).toBe(42)
    expect(chapterProgressPercent(book({ readStatus: status('read'), readingProgress: 100 }))).toBeNull()
    expect(chapterProgressPercent(book())).toBeNull()
  })
})
