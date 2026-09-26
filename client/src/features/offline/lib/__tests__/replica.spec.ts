import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteOfflineDb, openOfflineDb, type LocalProgress } from '../offline-db'
import { ReaderReplica } from '../replica'

let userIds = 100
const opened: ReaderReplica[] = []

async function openReplica(userId = userIds++) {
  const replica = new ReaderReplica(await openOfflineDb(userId), userId)
  opened.push(replica)
  return replica
}

function progress(fileId: number, percentage: number, readAt: string): LocalProgress {
  return {
    fileId,
    bookId: 1,
    percentage,
    cfi: `epubcfi(/6/${percentage})`,
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
    readAt,
  }
}

afterEach(async () => {
  for (const replica of opened.splice(0)) {
    replica.close()
    await deleteOfflineDb(replica.userId)
  }
})

describe('ReaderReplica', () => {
  it('keeps writes and their outbox entries across a restart', async () => {
    const userId = userIds++
    const first = new ReaderReplica(await openOfflineDb(userId), userId)
    await first.recordProgress(progress(7, 40, '2026-09-24T10:00:00.000Z'))
    await first.createAnnotation(1, { cfi: 'epubcfi(/6/4!/4/2)', text: 'offline highlight', color: 'yellow', style: 'highlight' })
    first.close()

    const reopened = await openReplica(userId)
    expect((await reopened.getProgress(7))?.percentage).toBe(40)
    expect((await reopened.listAnnotations(1)).map((row) => row.text)).toEqual(['offline highlight'])
    expect((await reopened.listOutbox()).map((entry) => entry.kind)).toEqual(['progress', 'annotation.create'])
  })

  it('keeps only the newest unsent position for a file', async () => {
    const replica = await openReplica()
    await replica.recordProgress(progress(7, 10, '2026-09-24T10:00:00.000Z'))
    await replica.recordProgress(progress(7, 20, '2026-09-24T10:01:00.000Z'))
    await replica.recordProgress(progress(8, 5, '2026-09-24T10:02:00.000Z'))

    const outbox = await replica.listOutbox()
    expect(outbox.map((entry) => (entry.kind === 'progress' ? [entry.fileId, entry.body.percentage] : null))).toEqual([
      [7, 20],
      [8, 5],
    ])
  })

  it('folds edits into a create that has not been sent, and a delete cancels both', async () => {
    const replica = await openReplica()
    const created = await replica.createAnnotation(1, { cfi: 'epubcfi(/6/4)', text: 'a', color: 'yellow', style: 'highlight' })
    await replica.updateAnnotation(1, created.id, { note: 'first thought', color: 'blue' })

    let outbox = await replica.listOutbox()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ kind: 'annotation.create', body: { note: 'first thought', color: 'blue' } })

    await replica.deleteAnnotation(1, created.id)
    outbox = await replica.listOutbox()
    expect(outbox).toEqual([])
    expect(await replica.listAnnotationsIncludingDeleted(1)).toEqual([])
  })

  it('queues a delete and keeps a tombstone once the create has reached the server', async () => {
    const replica = await openReplica()
    const created = await replica.createAnnotation(1, { cfi: 'epubcfi(/6/4)', text: 'a', color: 'yellow', style: 'highlight' })
    const [createEntry] = await replica.listOutbox()
    await replica.completeEntry(createEntry!, { annotation: { clientId: created.clientId, id: 55, serverId: 55 } })

    await replica.deleteAnnotation(1, 55)

    expect(await replica.listAnnotations(1)).toEqual([])
    expect((await replica.listAnnotationsIncludingDeleted(1))[0]).toMatchObject({ serverId: 55, deleted: true })
    expect((await replica.listOutbox()).map((entry) => entry.kind)).toEqual(['annotation.delete'])
  })

  it('takes server state for a book except where a local write is still queued', async () => {
    const replica = await openReplica()
    const mine = await replica.createAnnotation(1, { cfi: 'epubcfi(/6/2)', text: 'mine', color: 'yellow', style: 'highlight' })
    const serverItem = (id: number, text: string) => ({
      id,
      bookId: 1,
      cfi: `epubcfi(/6/${id})`,
      jumpFileId: null,
      pageno: null,
      text,
      color: 'green',
      style: 'highlight',
      note: null,
      chapterTitle: null,
      origin: 'koreader' as const,
      positionStatus: 'exact' as const,
      chapterIndex: null,
      highlightedAt: '2026-09-24T09:00:00.000Z',
      createdAt: '2026-09-24T09:00:00.000Z',
    })
    await replica.applyServerAnnotations(1, [serverItem(10, 'from kobo'), serverItem(11, 'soon deleted')])
    expect((await replica.listAnnotations(1)).map((row) => row.text).sort()).toEqual(['from kobo', 'mine', 'soon deleted'])

    await replica.applyServerAnnotations(1, [serverItem(10, 'from kobo')])
    expect((await replica.listAnnotations(1)).map((row) => row.text).sort()).toEqual(['from kobo', 'mine'])
    expect((await replica.listAnnotations(1)).find((row) => row.clientId === mine.clientId)?.serverId).toBeNull()
  })

  it('does not let an older server position replace a newer local one', async () => {
    const replica = await openReplica()
    await replica.recordProgress(progress(7, 60, '2026-09-24T10:00:00.000Z'))
    const [entry] = await replica.listOutbox()
    await replica.completeEntry(entry!)

    expect(await replica.applyServerProgress(progress(7, 30, '2026-09-24T09:00:00.000Z'))).toBe(false)
    expect(await replica.applyServerProgress(progress(7, 80, '2026-09-24T11:00:00.000Z'))).toBe(true)
    expect((await replica.getProgress(7))?.percentage).toBe(80)
  })

  it('compares a locally read position on the server clock before rejecting a newer server one', async () => {
    const replica = await openReplica()
    // This device's clock runs twenty minutes fast.
    await replica.setMeta('clockSkewMs', -20 * 60_000)
    await replica.recordProgress(progress(7, 40, '2026-09-24T10:20:00.000Z'))
    const [entry] = await replica.listOutbox()
    await replica.completeEntry(entry!)

    expect(await replica.applyServerProgress(progress(7, 60, '2026-09-24T10:10:00.000Z'))).toBe(true)
    expect((await replica.getProgress(7))?.percentage).toBe(60)
    // A position that came from the server is already on its clock.
    expect(await replica.applyServerProgress(progress(7, 50, '2026-09-24T10:05:00.000Z'))).toBe(false)
  })

  it('tells other tabs about changes', async () => {
    const userId = userIds++
    const writer = await openReplica(userId)
    const reader = await openReplica(userId)
    const seen = new Promise((resolve) => reader.subscribe(resolve))
    await writer.createBookmark(3, 'epubcfi(/6/8)', 'Chapter 2')
    await expect(seen).resolves.toMatchObject({ scope: 'bookmarks', bookId: 3 })
  })
})
