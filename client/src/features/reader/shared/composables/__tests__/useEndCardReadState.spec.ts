import { beforeEach, describe, expect, it, vi } from 'vitest'

type FakeResponse = { ok: boolean; status?: number; json: () => Promise<unknown> }

const api = vi.hoisted(() => vi.fn<(path: string, init?: RequestInit) => Promise<FakeResponse>>())

vi.mock('@/lib/api', () => ({ api }))

const { finishChapter, handOffToNextChapter, useEndCardReadState } = await import('../useEndCardReadState')

function jsonResponse(body: unknown, ok = true): FakeResponse {
  return { ok, json: async () => body }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function isStatusPatch(init?: RequestInit) {
  return init?.method === 'PATCH'
}

function chapterSteps(overrides: { isRead?: boolean; markRead?: () => Promise<unknown> } = {}) {
  const calls: string[] = []
  const onMarkFailed = vi.fn<(reason: unknown) => void>()
  return {
    calls,
    onMarkFailed,
    handoff: {
      saveEndPosition: async () => {
        calls.push('save-end')
      },
      endSession: () => {
        calls.push('end-session')
      },
      isRead: () => overrides.isRead ?? false,
      markRead:
        overrides.markRead ??
        (async () => {
          calls.push('mark')
        }),
      open: async () => {
        calls.push('open')
      },
      onMarkFailed,
    },
  }
}

describe('finishChapter', () => {
  it('closes the reading session at the end position before marking the chapter read', async () => {
    const { calls, handoff } = chapterSteps()

    await finishChapter(handoff)

    expect(calls).toEqual(['save-end', 'end-session', 'mark'])
  })

  it('still closes the position and session of a chapter that is already read', async () => {
    const { calls, handoff } = chapterSteps({ isRead: true })

    await finishChapter(handoff)

    expect(calls).toEqual(['save-end', 'end-session'])
  })

  it('lets a failed mark surface to the caller', async () => {
    const failure = new Error('offline')
    const { calls, handoff } = chapterSteps({ markRead: () => Promise.reject(failure) })

    await expect(finishChapter(handoff)).rejects.toBe(failure)
    expect(calls).toEqual(['save-end', 'end-session'])
  })
})

describe('handOffToNextChapter', () => {
  it('finishes the chapter, then opens the next one', async () => {
    const { calls, handoff } = chapterSteps()

    await handOffToNextChapter(handoff)

    expect(calls).toEqual(['save-end', 'end-session', 'mark', 'open'])
  })

  it('does not mark a chapter that is already read', async () => {
    const { calls, handoff } = chapterSteps({ isRead: true })

    await handOffToNextChapter(handoff)

    expect(calls).toEqual(['save-end', 'end-session', 'open'])
  })

  it('still opens the next chapter when the mark fails', async () => {
    const failure = new Error('offline')
    const { calls, handoff, onMarkFailed } = chapterSteps({ markRead: () => Promise.reject(failure) })

    await handOffToNextChapter(handoff)

    await vi.waitFor(() => expect(onMarkFailed).toHaveBeenCalledWith(failure))
    expect(calls).toEqual(['save-end', 'end-session', 'open'])
  })

  it('opens the next chapter while a mark is still waiting on the network', async () => {
    const { calls, handoff, onMarkFailed } = chapterSteps({ markRead: () => new Promise(() => {}) })

    await handOffToNextChapter(handoff)

    expect(calls).toEqual(['save-end', 'end-session', 'open'])
    expect(onMarkFailed).not.toHaveBeenCalled()
  })

  it('reports a mark that fails after the next chapter has opened', async () => {
    let rejectMark!: (reason: unknown) => void
    const pending = new Promise<never>((_, reject) => {
      rejectMark = reject
    })
    const { calls, handoff, onMarkFailed } = chapterSteps({ markRead: () => pending })

    await handOffToNextChapter(handoff)
    expect(calls).toEqual(['save-end', 'end-session', 'open'])
    expect(onMarkFailed).not.toHaveBeenCalled()

    const failure = new Error('timed out')
    rejectMark(failure)

    await vi.waitFor(() => expect(onMarkFailed).toHaveBeenCalledWith(failure))
  })
})

describe('useEndCardReadState', () => {
  beforeEach(() => {
    api.mockReset()
  })

  it('starts from the status the reader opened with', () => {
    const state = useEndCardReadState(7)

    state.sync('read')
    expect(state.markedRead.value).toBe(true)

    state.sync('rereading')
    expect(state.markedRead.value).toBe(false)
  })

  it('picks up a book the server marked read while the reader was open', async () => {
    api.mockResolvedValue(jsonResponse({ id: 7, readStatus: { status: 'read' } }))
    const state = useEndCardReadState(7)
    state.sync('reading')

    await state.refresh()

    expect(api).toHaveBeenCalledWith('/api/v1/books/7')
    expect(state.markedRead.value).toBe(true)
  })

  it('keeps what it knows when the server cannot be asked', async () => {
    const state = useEndCardReadState(7)
    state.sync('read')

    api.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await state.refresh()
    expect(state.markedRead.value).toBe(true)

    api.mockResolvedValueOnce(jsonResponse({}, false))
    await state.refresh()
    expect(state.markedRead.value).toBe(true)
  })

  it('marks the book read through the status endpoint', async () => {
    api.mockResolvedValue(jsonResponse({ status: 'read', source: 'manual', startedAt: null, finishedAt: null, updatedAt: '' }))
    const state = useEndCardReadState(7)

    await state.markRead()

    expect(api).toHaveBeenCalledWith('/api/v1/books/7/status', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'read' }) }))
    expect(state.markedRead.value).toBe(true)
  })

  it('does not send a mark for a book already read', async () => {
    const state = useEndCardReadState(7)
    state.sync('read')

    await state.markRead()

    expect(api).not.toHaveBeenCalled()
  })

  it('lets a refused mark surface to the caller', async () => {
    api.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const state = useEndCardReadState(7)

    await expect(state.markRead()).rejects.toThrow('HTTP 500')
    expect(state.markedRead.value).toBe(false)
  })

  it('does not let a check that started before a mark undo it', async () => {
    const stale = deferred<FakeResponse>()
    api.mockImplementation((_path, init) => (isStatusPatch(init) ? Promise.resolve(jsonResponse({ status: 'read' })) : stale.promise))
    const state = useEndCardReadState(7)
    state.sync('reading')

    const refreshing = state.refresh()
    await state.markRead()
    stale.resolve(jsonResponse({ readStatus: { status: 'reading' } }))
    await refreshing

    expect(state.markedRead.value).toBe(true)
  })
})
