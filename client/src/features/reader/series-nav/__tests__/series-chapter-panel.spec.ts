import { describe, expect, it } from 'vitest'
import type { BookCard } from '@bookorbit/types'
import { chapterPanelSeriesId, readerRouteForChapter, seriesChapterTarget } from '../series-chapter-panel'

describe('chapterPanelSeriesId', () => {
  it('lists the series when the book has a contents list of one entry or none', () => {
    expect(chapterPanelSeriesId([], 7)).toBe(7)
    expect(chapterPanelSeriesId([{ label: 'Chapter 12', href: 'c.xhtml' }], 7)).toBe(7)
  })

  it('keeps a contents list with more than one entry, counting nested ones', () => {
    const entry = { label: 'Part', href: 'p.xhtml' }
    expect(chapterPanelSeriesId([entry, entry], 7)).toBeNull()
    expect(chapterPanelSeriesId([{ ...entry, subitems: [entry] }], 7)).toBeNull()
  })

  it('keeps the contents list for a book outside any series', () => {
    expect(chapterPanelSeriesId([], null)).toBeNull()
  })
})

describe('seriesChapterTarget', () => {
  it('opens the first readable file when the primary one cannot be read', () => {
    const book = {
      id: 9,
      files: [
        { id: 1, format: 'docx', role: 'primary' },
        { id: 2, format: 'epub', role: 'alternate' },
      ],
    } as unknown as BookCard
    expect(seriesChapterTarget(book)).toEqual({ bookId: 9, fileId: 2, format: 'epub' })
  })

  it('has no target for a chapter without a readable file', () => {
    expect(seriesChapterTarget({ id: 9, files: [] } as unknown as BookCard)).toBeNull()
  })
})

describe('readerRouteForChapter', () => {
  it('opens the chapter with only its format, carrying the history state through', () => {
    const state = { readerEnteredBookId: 3 }
    expect(readerRouteForChapter({ bookId: 9, fileId: 2, format: 'epub' }, state)).toEqual({
      name: 'reader',
      params: { bookId: 9, fileId: 2 },
      query: { format: 'epub' },
      state,
    })
  })
})
