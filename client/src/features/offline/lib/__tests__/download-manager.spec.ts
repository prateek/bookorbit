import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { NetworkError } from '@/lib/api'
import { DownloadManager, downloadStorageKey, type DownloadManagerOptions } from '../download-manager'
import { MemoryBookFileStore } from '../file-store'
import { deleteOfflineDb, openOfflineDb, STORES, type DownloadRecord } from '../offline-db'
import { inTransaction } from '../idb'

const CHUNK = 10
let userIds = 900
const dbs: Array<{ db: IDBDatabase; userId: number }> = []
const managers: DownloadManager[] = []

function bytes(length: number, seed = 1): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * seed + seed) % 251)
}

/** `/books/files/:id/serve` with the real route's single-range behaviour. */
class FileServer {
  files = new Map<number, Uint8Array>()
  ranges: string[] = []
  online = true
  ignoreRanges = false
  failNext: number | null = null
  /** Throw a network error after this many body bytes of the next response. */
  cutAfter: number | null = null
  /** Swap the file's content once this many requests have been served. */
  replaceAfter: { requests: number; data: Uint8Array } | null = null

  request = async (input: string, init: RequestInit = {}): Promise<Response> => {
    if (!this.online) throw new NetworkError('Failed to fetch')
    const fileId = Number(/files\/(\d+)\/serve/.exec(input)?.[1])
    const range = new Headers(init.headers).get('range')
    this.ranges.push(range ?? '')
    if (this.replaceAfter && this.ranges.length > this.replaceAfter.requests) {
      this.files.set(fileId, this.replaceAfter.data)
      this.replaceAfter = null
    }
    if (this.failNext !== null) {
      const status = this.failNext
      this.failNext = null
      return new Response(null, { status })
    }
    const data = this.files.get(fileId)
    if (!data) return new Response(null, { status: 404 })
    const match = range && !this.ignoreRanges ? /bytes=(\d+)-(\d*)/.exec(range) : null
    if (!match) return this.body(200, data, { 'content-length': String(data.length) })
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : data.length - 1
    // Like book.controller.ts: a range that runs past the end is unsatisfiable, never clamped.
    if (start >= data.length || end >= data.length) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${data.length}` } })
    return this.body(206, data.subarray(start, end + 1), {
      'content-range': `bytes ${start}-${end}/${data.length}`,
      'content-length': String(end - start + 1),
    })
  }

  private body(status: number, data: Uint8Array, headers: Record<string, string>): Response {
    const cutAfter = this.cutAfter
    this.cutAfter = null
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (cutAfter === null) {
          controller.enqueue(data.slice())
          controller.close()
          return
        }
        controller.enqueue(data.slice(0, cutAfter))
        controller.error(new TypeError('network connection was lost'))
      },
    })
    return new Response(stream, { status, headers })
  }
}

async function setup(options: Partial<DownloadManagerOptions> = {}, existing?: { userId: number; store: MemoryBookFileStore; server: FileServer }) {
  const userId = existing?.userId ?? userIds++
  const db = await openOfflineDb(userId)
  dbs.push({ db, userId })
  const store = existing?.store ?? new MemoryBookFileStore()
  const server = existing?.server ?? new FileServer()
  const completed: number[] = []
  const manager = new DownloadManager(db, store, {
    request: (input, init) => server.request(input, init),
    chunkBytes: CHUNK,
    retryDelayMs: () => 0,
    estimate: async () => ({ usage: 0, quota: 1_000_000 }),
    onCompleted: (record) => {
      completed.push(record.fileId)
    },
    ...options,
  })
  managers.push(manager)
  return { userId, db, store, server, manager, completed }
}

function settled(
  manager: DownloadManager,
  fileId: number,
  until: DownloadRecord['state'][] | ((record: DownloadRecord) => boolean) = ['completed', 'failed', 'paused'],
) {
  const matches = typeof until === 'function' ? until : (record: DownloadRecord) => until.includes(record.state)
  return new Promise<DownloadRecord>((resolve) => {
    const check = async () => {
      const record = await manager.get(fileId)
      if (record && matches(record)) {
        unsubscribe()
        resolve(record)
      }
    }
    const unsubscribe = manager.subscribe(() => void check())
    void check()
  })
}

const book = (fileId: number, sizeBytes: number | null) => ({ bookId: 1, fileId, format: 'epub', title: 'A Book', authors: ['Someone'], sizeBytes })

afterEach(async () => {
  for (const manager of managers.splice(0)) manager.dispose()
  for (const { db, userId } of dbs.splice(0)) {
    db.close()
    await deleteOfflineDb(userId)
  }
})

describe('DownloadManager', () => {
  it('downloads a file in range chunks and keeps it after a restart', async () => {
    const { userId, store, server, manager, completed } = await setup()
    server.files.set(7, bytes(35))
    await manager.enqueue(book(7, 35))

    const record = await settled(manager, 7)
    expect(record).toMatchObject({ state: 'completed', bytesDownloaded: 35 })
    expect(server.ranges).toEqual(['bytes=0-9', 'bytes=10-19', 'bytes=20-29', 'bytes=30-34'])
    expect(completed).toEqual([7])

    manager.dispose()
    const restarted = await setup({}, { userId, store, server })
    const blob = await restarted.manager.openFile(7)
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(bytes(35))
  })

  it('resumes an interrupted download from the last confirmed chunk', async () => {
    const { userId, store, server, manager } = await setup({ retryDelayMs: () => 60_000 })
    server.files.set(7, bytes(35))
    // The connection drops inside the third chunk.
    let served = 0
    const original = server.request
    server.request = async (input, init) => {
      served += 1
      if (served === 3) server.cutAfter = 4
      return original(input, init)
    }
    await manager.enqueue(book(7, 35))
    const interrupted = await settled(manager, 7, (record) => record.failure !== null)
    expect(interrupted.bytesDownloaded).toBe(20)
    expect(interrupted.failure).toBe('network')

    // The app is killed and reopened.
    manager.dispose()
    server.request = original
    server.ranges = []
    const reopened = await setup({}, { userId, store, server })
    await reopened.manager.start()
    const done = await settled(reopened.manager, 7)
    expect(done.state).toBe('completed')
    expect(server.ranges[0]).toBe('bytes=20-29')
    expect(new Uint8Array(await (await reopened.manager.openFile(7))!.arrayBuffer())).toEqual(bytes(35))
  })

  it('discards bytes past the confirmed offset when a killed download resumes', async () => {
    const { userId, db, store, server } = await setup()
    server.files.set(7, bytes(25))
    await store.write(downloadStorageKey(7), 0, bytes(25).subarray(0, 10))
    await store.write(downloadStorageKey(7), 10, new Uint8Array([9, 9, 9]))
    const now = new Date().toISOString()
    await inTransaction(db, [STORES.downloads], 'readwrite', (tx) => {
      tx.objectStore(STORES.downloads).put({
        ...book(7, 25),
        sizeBytes: 25,
        bytesDownloaded: 10,
        state: 'downloading',
        failure: null,
        error: null,
        attempts: 1,
        stale: false,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        checkedAt: null,
      } satisfies DownloadRecord)
    })

    const reopened = await setup({}, { userId, store, server })
    await reopened.manager.start()
    await settled(reopened.manager, 7)
    expect(server.ranges).toEqual(['bytes=10-19', 'bytes=20-24'])
    expect(new Uint8Array(await (await reopened.manager.openFile(7))!.arrayBuffer())).toEqual(bytes(25))
  })

  it('learns the size from a 416 when it was unknown or wrong', async () => {
    const unknown = await setup()
    unknown.server.files.set(7, bytes(6))
    await unknown.manager.enqueue(book(7, null))
    expect(await settled(unknown.manager, 7)).toMatchObject({ state: 'completed', sizeBytes: 6, bytesDownloaded: 6 })
    expect(unknown.server.ranges).toEqual(['bytes=0-9', 'bytes=0-5'])

    const shrunk = await setup()
    shrunk.server.files.set(7, bytes(6))
    await shrunk.manager.enqueue(book(7, 40))
    expect(await settled(shrunk.manager, 7)).toMatchObject({ state: 'completed', sizeBytes: 6 })
    expect(new Uint8Array(await (await shrunk.manager.openFile(7))!.arrayBuffer())).toEqual(bytes(6))
  })

  it('restarts from the beginning when the file changed on the server mid-download', async () => {
    const { server, manager } = await setup()
    server.files.set(7, bytes(30))
    server.replaceAfter = { requests: 1, data: bytes(24, 3) }
    await manager.enqueue(book(7, 30))

    const record = await settled(manager, 7)
    expect(record).toMatchObject({ state: 'completed', sizeBytes: 24 })
    expect(new Uint8Array(await (await manager.openFile(7))!.arrayBuffer())).toEqual(bytes(24, 3))
  })

  it('starts over when a server ignores the range on resume', async () => {
    const { server, manager } = await setup()
    server.files.set(7, bytes(25))
    let calls = 0
    const original = server.request
    server.request = async (input, init) => {
      calls += 1
      server.ignoreRanges = calls === 2
      return original(input, init)
    }
    await manager.enqueue(book(7, 25))
    const record = await settled(manager, 7)
    expect(record.state).toBe('completed')
    expect(new Uint8Array(await (await manager.openFile(7))!.arrayBuffer())).toEqual(bytes(25))
  })

  it('retries a transient server error on its own', async () => {
    const { server, manager } = await setup()
    server.files.set(7, bytes(15))
    server.failNext = 503
    await manager.enqueue(book(7, 15))
    const record = await settled(manager, 7)
    expect(record).toMatchObject({ state: 'completed', attempts: 2 })
  })

  it('fails without retrying when the book is gone or storage is full', async () => {
    const gone = await setup()
    await gone.manager.enqueue(book(8, 15))
    expect(await settled(gone.manager, 8)).toMatchObject({ state: 'failed', failure: 'gone' })

    const noRoom = await setup({ estimate: async () => ({ usage: 990, quota: 1000 }) })
    noRoom.server.files.set(7, bytes(50))
    await noRoom.manager.enqueue(book(7, 50))
    expect(await settled(noRoom.manager, 7)).toMatchObject({ state: 'failed', failure: 'quota', bytesDownloaded: 0 })

    const full = await setup()
    full.store.capacity = 25
    full.server.files.set(7, bytes(50))
    await full.manager.enqueue(book(7, 50))
    expect(await settled(full.manager, 7)).toMatchObject({ state: 'failed', failure: 'quota', bytesDownloaded: 20 })
  })

  it('pauses, resumes and removes a download', async () => {
    const { server, store, manager } = await setup()
    server.files.set(7, bytes(40))
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const original = server.request
    server.request = async (input, init) => {
      if (server.ranges.length === 2) await gate
      return original(input, init)
    }
    await manager.enqueue(book(7, 40))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await manager.pause(7)
    release()
    expect(await settled(manager, 7, ['paused'])).toMatchObject({ state: 'paused' })

    await manager.resume(7)
    expect(await settled(manager, 7)).toMatchObject({ state: 'completed', bytesDownloaded: 40 })

    await manager.remove(7)
    expect(await manager.get(7)).toBeNull()
    expect(store.files.has(downloadStorageKey(7))).toBe(false)
  })
})
