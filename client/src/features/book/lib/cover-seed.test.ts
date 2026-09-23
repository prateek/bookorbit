import { describe, expect, it } from 'vitest'
import { bookCoverSeed, seriesCoverSeed } from './cover-seed'

describe('bookCoverSeed', () => {
  it('seeds from the series name so chapters of one series share a color', () => {
    const first = bookCoverSeed({ id: 1, title: 'Chapter 1', seriesName: 'Mother of Learning' })
    const second = bookCoverSeed({ id: 2, title: 'Chapter 2', seriesName: ' mother of learning ' })
    expect(first).toBe(second)
    expect(first).toBe(seriesCoverSeed('Mother of Learning'))
  })

  it('falls back to the title, then the id, without a series', () => {
    expect(bookCoverSeed({ id: 7, title: 'Standalone', seriesName: null })).toBe('Standalone')
    expect(bookCoverSeed({ id: 7, title: null, seriesName: '  ' })).toBe('7')
  })
})
