import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { deleteOfflineDb, openOfflineDb } from '@/features/offline/lib/offline-db'
import { ReaderReplica } from '@/features/offline/lib/replica'
import type { OfflineSession } from '@/features/offline/offline-session'

const apiMock = vi.hoisted(() => vi.fn<(input: string, init?: RequestInit) => Promise<Response>>())
const sessionRef = vi.hoisted(() => ({ current: null as OfflineSession | null }))

vi.mock('@/lib/api', () => ({ api: apiMock }))
vi.mock('@/features/offline/offline-session', () => ({
  currentOfflineSession: () => sessionRef.current,
  whenOfflineSession: async () => sessionRef.current,
}))

import { useReaderProgress } from '../useReaderProgress'

let userId = 700

function serverRow(percentage: number, lastReadAt: string) {
  return new Response(JSON.stringify({ percentage, cfi: `epubcfi(/6/${percentage})`, lastReadAt }), { status: 200 })
}

describe('useReaderProgress with a local replica', () => {
  let replica: ReaderReplica

  beforeEach(async () => {
    apiMock.mockReset()
    replica = new ReaderReplica(await openOfflineDb(++userId), userId)
    sessionRef.current = { userId, replica } as unknown as OfflineSession
  })

  afterEach(async () => {
    replica.close()
    await deleteOfflineDb(userId)
    sessionRef.current = null
  })

  function mountProgress() {
    const scope = effectScope()
    const progress = scope.run(() => useReaderProgress(3, 9, ref(0)))!
    return { progress, scope }
  }

  it('records a page turn locally and queues it, with no request while the reader stays open', async () => {
    const { progress, scope } = mountProgress()
    progress.onRelocate({ cfi: 'epubcfi(/6/12)', fraction: 0.4 })
    await progress.save()

    expect(apiMock).not.toHaveBeenCalled()
    expect(await replica.getProgress(9)).toMatchObject({ percentage: 40, cfi: 'epubcfi(/6/12)' })
    expect((await replica.listOutbox()).map((entry) => entry.kind)).toEqual(['progress'])
    scope.stop()
  })

  it('resumes from the local position when the server cannot be reached', async () => {
    await replica.recordProgress({
      fileId: 9,
      bookId: 3,
      percentage: 62,
      cfi: 'epubcfi(/6/20)',
      pageNumber: null,
      positionSeconds: null,
      mediaOverlayFragment: null,
      mediaOverlaySectionIndex: null,
      koboLocationSource: null,
      koboLocationType: null,
      koboLocationValue: null,
      koboContentSourceProgressPercent: null,
      koreaderProgress: null,
      source: 'text',
      readAt: '2026-09-24T10:00:00.000Z',
    })
    apiMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { progress, scope } = mountProgress()

    await progress.load()

    expect(progress.cfi.value).toBe('epubcfi(/6/20)')
    expect(progress.percentage.value).toBe(62)
    scope.stop()
  })

  it('takes a position another device read later, once nothing local is waiting to be sent', async () => {
    const { progress, scope } = mountProgress()
    progress.onRelocate({ cfi: 'epubcfi(/6/12)', fraction: 0.3 })
    await progress.save()

    const laterRead = new Date(Date.now() + 60_000).toISOString()
    apiMock.mockImplementation(async () => serverRow(80, laterRead))
    await progress.load()
    expect(progress.percentage.value).toBe(30)

    const [entry] = await replica.listOutbox()
    await replica.completeEntry(entry!)
    await progress.load()
    expect(progress.percentage.value).toBe(80)
    scope.stop()
  })
})
