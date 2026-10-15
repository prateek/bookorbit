import { describe, expect, it } from 'vitest'
import { seriesAnchorBookId } from './series-anchor'

describe('seriesAnchorBookId', () => {
  it('reads a positive integer book id', () => {
    expect(seriesAnchorBookId({ book: '42' })).toBe(42)
  })

  it('ignores a missing, repeated or malformed value', () => {
    expect(seriesAnchorBookId({})).toBeNull()
    expect(seriesAnchorBookId({ book: ['1', '2'] })).toBeNull()
    expect(seriesAnchorBookId({ book: 'abc' })).toBeNull()
    expect(seriesAnchorBookId({ book: '0' })).toBeNull()
    expect(seriesAnchorBookId({ book: '1.5' })).toBeNull()
  })
})
