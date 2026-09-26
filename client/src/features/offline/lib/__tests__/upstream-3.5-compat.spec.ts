import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteOfflineDb, openOfflineDb, type LocalProgress } from '../offline-db'
import { ReaderReplica } from '../replica'
import { SyncEngine } from '../sync-engine'

const replicas: ReaderReplica[] = []
let userId = 35000
async function openReplica() {
  const id = userId++
  const replica = new ReaderReplica(await openOfflineDb(id), id)
  replicas.push(replica)
  return replica
}
afterEach(async () => {
  for (const replica of replicas.splice(0)) {
    replica.close()
    await deleteOfflineDb(replica.userId)
  }
})

describe('upstream reader compatibility', () => {
  it('delivers an offline bookmark edit after its create and keeps its file identity', async () => {
    const replica = await openReplica()
    const bookmark = await replica.createBookmark(1, 'epubcfi(/6/4)', 'Chapter', 7)
    await replica.updateBookmark(1, bookmark.id, { title: 'Remember', note: 'Return here' })
    const request = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async (_path: string, init?: RequestInit) =>
      Response.json(init?.method === 'POST' ? { id: 42 } : {}),
    )
    expect(await new SyncEngine(replica, request).push()).toBe('drained')
    expect(request.mock.calls.map(([path, init]) => [path, init?.method, JSON.parse(String(init?.body))])).toEqual([
      ['/api/v1/books/1/bookmarks', 'POST', { cfi: 'epubcfi(/6/4)', title: 'Chapter', bookFileId: 7 }],
      ['/api/v1/books/1/bookmarks/42', 'PATCH', { title: 'Remember', note: 'Return here' }],
    ])
    expect(await replica.listBookmarks(1)).toEqual([expect.objectContaining({ id: 42, bookFileId: 7, title: 'Remember', note: 'Return here' })])
  })

  it('does not overwrite narration when replaying a text position', async () => {
    const replica = await openReplica()
    const progress: LocalProgress = {
      fileId: 7,
      bookId: 1,
      percentage: 35,
      cfi: 'epubcfi(/6/4)',
      pageNumber: null,
      positionSeconds: 10,
      mediaOverlayFragment: 'stale-sentence',
      mediaOverlaySectionIndex: 1,
      koboLocationSource: null,
      koboLocationType: null,
      koboLocationValue: null,
      koboContentSourceProgressPercent: null,
      koreaderProgress: null,
      source: 'text',
      readAt: new Date().toISOString(),
    }
    await replica.recordProgress(progress)
    const request = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({}))
    expect(await new SyncEngine(replica, request).push()).toBe('drained')
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ source: 'text', cfi: progress.cfi, percentage: 35 })
    expect(body).not.toHaveProperty('mediaOverlayFragment')
    expect(body).not.toHaveProperty('mediaOverlaySectionIndex')
    expect(body).not.toHaveProperty('positionSeconds')
    expect((await replica.getProgress(7))?.mediaOverlayFragment).toBe('stale-sentence')
  })
})
