import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteOfflineDb, openOfflineDb, type LocalProgress } from '../offline-db'
import { ReaderReplica } from '../replica'
import { readFailureLog, SyncEngine } from '../sync-engine'
import { FakeBookOrbitServer } from './fake-bookorbit-server'

let userIds = 500
const opened: ReaderReplica[] = []

async function device(server: FakeBookOrbitServer) {
  const userId = userIds++
  const replica = new ReaderReplica(await openOfflineDb(userId), userId)
  opened.push(replica)
  return { replica, engine: new SyncEngine(replica, server.client()) }
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

const highlight = { cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:9)', text: 'a passage', color: 'yellow', style: 'highlight' }

describe('SyncEngine', () => {
  let server: FakeBookOrbitServer

  beforeEach(() => {
    server = new FakeBookOrbitServer()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(server.now)
  })

  afterEach(async () => {
    vi.useRealTimers()
    for (const replica of opened.splice(0)) {
      replica.close()
      await deleteOfflineDb(replica.userId)
    }
  })

  it('keeps offline writes queued and delivers them in order once the server is reachable', async () => {
    const { replica, engine } = await device(server)
    server.online = false
    const created = await replica.createAnnotation(1, highlight)
    await replica.updateAnnotation(1, created.id, { note: 'noted' })
    await replica.createBookmark(1, 'epubcfi(/6/8)', 'Chapter 2')
    await replica.recordProgress(progress(7, 42, new Date().toISOString()))

    expect(await engine.push()).toBe('offline')
    expect(await replica.countOutbox()).toBe(3)

    server.online = true
    expect(await engine.push()).toBe('drained')
    expect(await replica.countOutbox()).toBe(0)
    expect(server.liveAnnotations(1)).toMatchObject([{ text: 'a passage', note: 'noted' }])
    expect(server.liveBookmarks(1)).toHaveLength(1)
    expect(server.progress.get(7)?.percentage).toBe(42)

    const [local] = await replica.listAnnotations(1)
    expect(local).toMatchObject({ clientId: created.clientId, serverId: server.liveAnnotations(1)[0]!.id })
  })

  it('does not duplicate an annotation whose create landed but whose response was lost', async () => {
    const { replica, engine } = await device(server)
    await replica.createAnnotation(1, highlight)
    server.dropResponseFor = /^POST \/api\/v1\/books\/1\/annotations$/

    expect(await engine.push()).toBe('offline')
    expect(server.liveAnnotations(1)).toHaveLength(1)

    expect(await engine.push()).toBe('drained')
    expect(server.liveAnnotations(1)).toHaveLength(1)
    expect((await replica.listAnnotations(1))[0]?.serverId).toBe(server.liveAnnotations(1)[0]!.id)
  })

  it('keeps a session idempotent when its delivery is retried', async () => {
    const { replica, engine } = await device(server)
    const session = { sessionId: 'session-1', startedAt: '2026-09-24T11:00:00.000Z', endedAt: '2026-09-24T11:30:00.000Z', durationSeconds: 1800 }
    await replica.recordSession(7, 1, session)
    server.dropResponseFor = /sessions$/
    expect(await engine.push()).toBe('offline')
    expect(await engine.push()).toBe('drained')
    expect(server.sessions.size).toBe(1)
  })

  it('lets a position read later on another device win over an older offline one', async () => {
    const phone = await device(server)
    const tablet = await device(server)

    server.online = false
    await phone.replica.recordProgress(progress(7, 30, new Date(server.now).toISOString()))

    server.online = true
    server.tick(5 * 60_000)
    vi.setSystemTime(server.now)
    await tablet.replica.recordProgress(progress(7, 55, new Date(server.now).toISOString()))
    expect(await tablet.engine.push()).toBe('drained')

    expect(await phone.engine.push()).toBe('drained')
    expect(server.progress.get(7)?.percentage).toBe(55)
    expect((await phone.replica.getProgress(7))?.percentage).toBe(55)
  })

  it('lets a newer offline position win over an older server one', async () => {
    const phone = await device(server)
    server.progress.set(7, { percentage: 10, cfi: null, pageNumber: null, lastReadAt: new Date(server.now - 3_600_000).toISOString() })
    await phone.replica.recordProgress(progress(7, 70, new Date(server.now).toISOString()))
    expect(await phone.engine.push()).toBe('drained')
    expect(server.progress.get(7)?.percentage).toBe(70)
  })

  it('corrects for a device clock that runs fast', async () => {
    const phone = await device(server)
    server.progress.set(7, { percentage: 50, cfi: null, pageNumber: null, lastReadAt: new Date(server.now - 60_000).toISOString() })
    // The phone's clock is ten minutes fast, so its "now" looks newer than the server row but is not.
    vi.setSystemTime(server.now + 600_000)
    await phone.replica.recordProgress(progress(7, 20, new Date(server.now + 600_000 - 120_000).toISOString()))
    await phone.engine.refreshBook(1, [])
    expect(await phone.engine.push()).toBe('drained')
    expect(server.progress.get(7)?.percentage).toBe(50)
  })

  it('converges when two devices edit and delete the same annotation', async () => {
    const phone = await device(server)
    const tablet = await device(server)
    const created = await phone.replica.createAnnotation(1, highlight)
    await phone.engine.push()
    await tablet.engine.refreshBook(1, [])
    const [onTablet] = await tablet.replica.listAnnotations(1)
    expect(onTablet?.serverId).toBe((await phone.replica.listAnnotations(1))[0]!.serverId)

    await tablet.replica.deleteAnnotation(1, onTablet!.id)
    server.online = false
    await phone.replica.updateAnnotation(1, (await phone.replica.listAnnotations(1))[0]!.id, { color: 'blue' })
    server.online = true

    expect(await tablet.engine.push()).toBe('drained')
    expect(await phone.engine.push()).toBe('drained')
    expect(server.liveAnnotations(1)).toEqual([])
    expect(await phone.replica.listAnnotationsIncludingDeleted(1)).toEqual([])
    expect(created.clientId).toBeTruthy()

    await phone.engine.refreshBook(1, [])
    await tablet.engine.refreshBook(1, [])
    expect(await phone.replica.listAnnotations(1)).toEqual([])
    expect(await tablet.replica.listAnnotations(1)).toEqual([])
  })

  it('merges bookmarks two devices made at the same place into one', async () => {
    const phone = await device(server)
    const tablet = await device(server)
    await phone.replica.createBookmark(1, 'epubcfi(/6/8)', 'Chapter 2')
    await tablet.replica.createBookmark(1, 'epubcfi(/6/8)', 'Chapter 2')
    await phone.engine.push()
    await tablet.engine.push()
    await phone.engine.refreshBook(1, [])
    await tablet.engine.refreshBook(1, [])

    expect(server.liveBookmarks(1)).toHaveLength(1)
    expect(await phone.replica.listBookmarks(1)).toHaveLength(1)
    expect(await tablet.replica.listBookmarks(1)).toHaveLength(1)

    const [bookmark] = await tablet.replica.listBookmarks(1)
    await tablet.replica.deleteBookmark(1, bookmark!.id)
    await tablet.engine.push()
    await phone.engine.refreshBook(1, [])
    expect(server.liveBookmarks(1)).toHaveLength(0)
    expect(await phone.replica.listBookmarks(1)).toHaveLength(0)
  })

  it('drops a write the server refuses for good, logs it, and keeps going', async () => {
    const { replica, engine } = await device(server)
    server.rejectBooks.add(9)
    await replica.createAnnotation(9, highlight)
    await replica.createBookmark(1, 'epubcfi(/6/8)', 'Chapter 2')

    expect(await engine.push()).toBe('drained')
    expect(await replica.listAnnotations(9)).toEqual([])
    expect(server.liveBookmarks(1)).toHaveLength(1)
    expect(await readFailureLog(replica)).toMatchObject([{ kind: 'annotation.create', bookId: 9, status: 404 }])
  })

  it('does not let a refresh overwrite a local write that is still queued', async () => {
    const phone = await device(server)
    const tablet = await device(server)
    await tablet.replica.createAnnotation(1, highlight)
    await tablet.engine.push()
    await phone.engine.refreshBook(1, [])
    const [local] = await phone.replica.listAnnotations(1)
    await phone.replica.updateAnnotation(1, local!.id, { note: 'mine' })

    await phone.engine.refreshBook(1, [])
    expect((await phone.replica.listAnnotations(1))[0]?.note).toBe('mine')

    await phone.engine.push()
    await phone.engine.refreshBook(1, [])
    expect((await phone.replica.listAnnotations(1))[0]?.note).toBe('mine')
    expect(server.liveAnnotations(1)[0]?.note).toBe('mine')
  })
})
