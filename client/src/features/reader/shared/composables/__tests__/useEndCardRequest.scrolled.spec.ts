import { describe, expect, it } from 'vitest'
import { useEndCardRequest } from '../useEndCardRequest'

describe('useEndCardRequest in scrolled flow', () => {
  it('shows once the bottom of the chapter is reached, without a forward turn', () => {
    const endCard = useEndCardRequest()

    endCard.syncAtEnd(false, { scrolled: true })
    expect(endCard.requested.value).toBe(false)

    endCard.syncAtEnd(true, { scrolled: true })
    expect(endCard.requested.value).toBe(true)
  })

  it('still waits for a forward turn in paginated flow', () => {
    const endCard = useEndCardRequest()

    endCard.syncAtEnd(true, { scrolled: false })
    expect(endCard.requested.value).toBe(false)

    endCard.request()
    expect(endCard.requested.value).toBe(true)
  })

  it('stays dismissed while the reader keeps scrolling at the bottom', () => {
    const endCard = useEndCardRequest()
    endCard.syncAtEnd(true, { scrolled: true })

    endCard.dismiss()
    endCard.syncAtEnd(true, { scrolled: true })
    endCard.syncAtEnd(true, { scrolled: true })

    expect(endCard.requested.value).toBe(false)
  })

  it('stays dismissed against a forward turn at the bottom', () => {
    const endCard = useEndCardRequest()
    endCard.syncAtEnd(true, { scrolled: true })
    endCard.dismiss()

    endCard.request()

    expect(endCard.requested.value).toBe(false)
  })

  it('shows again after the reader scrolls away from the bottom and back', () => {
    const endCard = useEndCardRequest()
    endCard.syncAtEnd(true, { scrolled: true })
    endCard.dismiss()

    endCard.syncAtEnd(false, { scrolled: true })
    expect(endCard.requested.value).toBe(false)

    endCard.syncAtEnd(true, { scrolled: true })
    expect(endCard.requested.value).toBe(true)
  })

  it('withdraws the card when the reader scrolls up off the bottom', () => {
    const endCard = useEndCardRequest()
    endCard.syncAtEnd(true, { scrolled: true })

    endCard.syncAtEnd(false, { scrolled: true })

    expect(endCard.requested.value).toBe(false)
  })
})
