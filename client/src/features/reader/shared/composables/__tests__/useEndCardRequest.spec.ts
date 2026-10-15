import { describe, expect, it } from 'vitest'
import { useEndCardRequest } from '../useEndCardRequest'

describe('useEndCardRequest', () => {
  it('stays hidden when the last page is merely reached', () => {
    const endCard = useEndCardRequest()

    endCard.syncAtEnd(true)

    expect(endCard.requested.value).toBe(false)
  })

  it('shows once a turn goes past the last page', () => {
    const endCard = useEndCardRequest()
    endCard.syncAtEnd(true)

    endCard.request()

    expect(endCard.requested.value).toBe(true)
  })

  it('stays dismissed until the next forward attempt', () => {
    const endCard = useEndCardRequest()
    endCard.request()

    endCard.dismiss()
    endCard.syncAtEnd(true)
    expect(endCard.requested.value).toBe(false)

    endCard.request()
    expect(endCard.requested.value).toBe(true)
  })

  it('withdraws the request when the reader moves back off the last page', () => {
    const endCard = useEndCardRequest()
    endCard.request()

    endCard.syncAtEnd(false)
    expect(endCard.requested.value).toBe(false)

    endCard.syncAtEnd(true)
    expect(endCard.requested.value).toBe(false)
  })
})
