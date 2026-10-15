import { describe, expect, it } from 'vitest'
import { canShowEndCard } from '../useEndCardRequest'

describe('canShowEndCard', () => {
  it('offers a card in tracked reading, with or without a next chapter', () => {
    expect(canShowEndCard({ tracking: true, hasNextBook: true })).toBe(true)
    expect(canShowEndCard({ tracking: true, hasNextBook: false })).toBe(true)
  })

  it('offers a card in a peek only when there is a next chapter', () => {
    expect(canShowEndCard({ tracking: false, hasNextBook: true })).toBe(true)
    expect(canShowEndCard({ tracking: false, hasNextBook: false })).toBe(false)
  })
})
