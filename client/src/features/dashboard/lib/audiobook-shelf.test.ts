import { describe, expect, it } from 'vitest'
import { canHoldAudiobooks } from './audiobook-shelf'

describe('canHoldAudiobooks', () => {
  it('treats a book library with no format restriction as able to hold audiobooks', () => {
    expect(canHoldAudiobooks([{ type: 'books', allowedFormats: [] }])).toBe(true)
  })

  it('accepts a book library that allows any audio format, ignoring case and whitespace', () => {
    expect(canHoldAudiobooks([{ type: 'books', allowedFormats: ['epub', ' M4B '] }])).toBe(true)
  })

  it('rejects ebook-only and podcast libraries', () => {
    expect(
      canHoldAudiobooks([
        { type: 'books', allowedFormats: ['epub', 'pdf'] },
        { type: 'podcasts', allowedFormats: [] },
      ]),
    ).toBe(false)
  })

  it('rejects an empty library list', () => {
    expect(canHoldAudiobooks([])).toBe(false)
  })
})
