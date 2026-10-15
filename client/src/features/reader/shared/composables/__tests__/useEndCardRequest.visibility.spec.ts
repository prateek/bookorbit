import { describe, expect, it } from 'vitest'
import { isEndCardVisible, type EndCardVisibility } from '../useEndCardRequest'

const shown: EndCardVisibility = { requested: true, readerBusy: false, tracking: true, hasNextBook: true }

describe('isEndCardVisible', () => {
  it('shows a requested card in tracked reading, with or without a next chapter', () => {
    expect(isEndCardVisible(shown)).toBe(true)
    expect(isEndCardVisible({ ...shown, hasNextBook: false })).toBe(true)
  })

  it('shows a requested card in a peek when there is a next chapter to offer', () => {
    expect(isEndCardVisible({ ...shown, tracking: false })).toBe(true)
  })

  it('keeps a peek with no next chapter free of a card that offers nothing', () => {
    expect(isEndCardVisible({ ...shown, tracking: false, hasNextBook: false })).toBe(false)
  })

  it('stays hidden until a turn past the last page asks for it', () => {
    expect(isEndCardVisible({ ...shown, requested: false })).toBe(false)
    expect(isEndCardVisible({ ...shown, tracking: false, requested: false })).toBe(false)
  })

  it('stays hidden while the reader is busy', () => {
    expect(isEndCardVisible({ ...shown, readerBusy: true })).toBe(false)
    expect(isEndCardVisible({ ...shown, tracking: false, readerBusy: true })).toBe(false)
  })
})
