import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ api: vi.fn<() => Promise<unknown>>() }))

const { finishChapter, handOffToNextChapter } = await import('../useEndCardReadState')

function peekSteps(canMarkRead?: () => boolean) {
  const calls: string[] = []
  const markRead = vi.fn<() => Promise<void>>(async () => {
    calls.push('mark')
  })
  const onMarkFailed = vi.fn<(reason: unknown) => void>()
  return {
    calls,
    markRead,
    onMarkFailed,
    steps: {
      saveEndPosition: async () => {
        calls.push('save-end')
      },
      endSession: () => {
        calls.push('end-session')
      },
      isRead: () => false,
      canMarkRead,
      markRead,
      open: async () => {
        calls.push('open')
      },
      onMarkFailed,
    },
  }
}

describe('finishing a peeked chapter', () => {
  it('opens the next chapter without marking the peeked one read', async () => {
    const { calls, markRead, onMarkFailed, steps } = peekSteps(() => false)

    await handOffToNextChapter(steps)

    expect(calls).toEqual(['save-end', 'end-session', 'open'])
    expect(markRead).not.toHaveBeenCalled()
    expect(onMarkFailed).not.toHaveBeenCalled()
  })

  it('leaves the read status alone when finished in place', async () => {
    const { calls, markRead, steps } = peekSteps(() => false)

    await finishChapter(steps)

    expect(calls).toEqual(['save-end', 'end-session'])
    expect(markRead).not.toHaveBeenCalled()
  })

  it('marks the chapter read once tracked reading has started', async () => {
    const { calls, steps } = peekSteps(() => true)

    await handOffToNextChapter(steps)

    expect(calls).toEqual(['save-end', 'end-session', 'mark', 'open'])
  })

  it('marks the chapter read when the caller does not say whether it is tracked', async () => {
    const { calls, steps } = peekSteps()

    await finishChapter(steps)

    expect(calls).toEqual(['save-end', 'end-session', 'mark'])
  })
})
