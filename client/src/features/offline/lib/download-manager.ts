import { api, isServerUnreachable } from '@/lib/api'
import { inTransaction, requestResult } from './idb'
import { STORES, type BookSnapshot, type DownloadFailure, type DownloadRecord } from './offline-db'
import type { BookFileStore } from './file-store'

/** Bytes per Range request. A killed app loses at most one chunk of work. */
export const DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024
export const MAX_CONCURRENT_DOWNLOADS = 2
const MAX_AUTOMATIC_ATTEMPTS = 5
const PROGRESS_NOTIFY_INTERVAL_MS = 250

type Request = (input: string, init?: RequestInit) => Promise<Response>

export interface DownloadRequest {
  bookId: number
  fileId: number
  format: string
  title: string
  authors: string[]
  sizeBytes: number | null
}

export interface StorageStatus {
  usage: number | null
  quota: number | null
  persisted: boolean | null
}

export interface DownloadManagerOptions {
  request?: Request
  estimate?: () => Promise<{ usage?: number; quota?: number }>
  isOnline?: () => boolean
  /** Called once a file is complete, to fetch what reading it offline needs besides the bytes. */
  onCompleted?: (record: DownloadRecord) => Promise<void> | void
  retryDelayMs?: (attempt: number) => number
  chunkBytes?: number
}

class DownloadError extends Error {
  constructor(
    readonly failure: DownloadFailure,
    message: string,
    /** The file's size as the server now reports it, when a 416 revealed the recorded one was wrong. */
    readonly actualSize: number | null = null,
  ) {
    super(message)
  }
}

export function downloadStorageKey(fileId: number): string {
  return `file-${fileId}`
}

/**
 * Downloads book files for offline reading. The queue lives in IndexedDB and every chunk that
 * reaches storage advances a persisted offset, so a download interrupted by a lost connection, a
 * closed tab or iOS suspending the app resumes from that offset the next time the app runs. Nothing
 * here assumes the page keeps running in the background.
 *
 * Files come from `/books/files/:id/serve`, the route the web reader already uses, which answers
 * byte ranges. Each range reply states the file's total size, so a file replaced on the server
 * mid-download is caught and restarted rather than spliced.
 */
export class DownloadManager {
  private readonly active = new Map<number, AbortController>()
  private readonly listeners = new Set<(records: DownloadRecord[]) => void>()
  private readonly live = new Map<number, DownloadRecord>()
  private readonly request: Request
  private readonly retryTimers = new Map<number, ReturnType<typeof setTimeout>>()
  private lastNotifyAt = 0
  private disposed = false

  constructor(
    private readonly db: IDBDatabase,
    private readonly files: BookFileStore,
    private readonly options: DownloadManagerOptions = {},
  ) {
    this.request = options.request ?? api
  }

  /** Recovers downloads the last session left running, then resumes the queue. */
  async start(): Promise<void> {
    for (const record of await this.list()) {
      if (record.state === 'downloading') await this.save({ ...record, state: 'queued' })
    }
    await this.pump()
  }

  dispose() {
    this.disposed = true
    for (const controller of this.active.values()) controller.abort()
    for (const timer of this.retryTimers.values()) clearTimeout(timer)
    this.retryTimers.clear()
  }

  subscribe(listener: (records: DownloadRecord[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async list(): Promise<DownloadRecord[]> {
    const rows = await inTransaction(this.db, [STORES.downloads], 'readonly', (tx) =>
      requestResult(tx.objectStore(STORES.downloads).getAll() as IDBRequest<DownloadRecord[]>),
    )
    return rows.map((row) => this.live.get(row.fileId) ?? row).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async get(fileId: number): Promise<DownloadRecord | null> {
    const live = this.live.get(fileId)
    if (live) return live
    return inTransaction(
      this.db,
      [STORES.downloads],
      'readonly',
      async (tx) => ((await requestResult(tx.objectStore(STORES.downloads).get(fileId))) as DownloadRecord | undefined) ?? null,
    )
  }

  async enqueue(request: DownloadRequest, snapshot?: Omit<BookSnapshot, 'savedAt'>): Promise<DownloadRecord> {
    const existing = await this.get(request.fileId)
    if (existing && existing.state !== 'failed') {
      if (existing.state === 'paused') return this.resume(request.fileId)
      return existing
    }
    const now = new Date().toISOString()
    const record: DownloadRecord = {
      fileId: request.fileId,
      bookId: request.bookId,
      format: request.format,
      title: request.title,
      authors: request.authors,
      sizeBytes: request.sizeBytes ?? 0,
      bytesDownloaded: existing?.bytesDownloaded ?? 0,
      state: 'queued',
      failure: null,
      error: null,
      attempts: 0,
      stale: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      completedAt: null,
      checkedAt: null,
    }
    await inTransaction(this.db, [STORES.downloads, STORES.books], 'readwrite', (tx) => {
      tx.objectStore(STORES.downloads).put(record)
      if (snapshot) tx.objectStore(STORES.books).put({ ...snapshot, savedAt: now } satisfies BookSnapshot)
    })
    this.emit(true)
    void this.pump()
    return record
  }

  async pause(fileId: number): Promise<void> {
    this.active.get(fileId)?.abort('pause')
    const record = await this.get(fileId)
    if (record && (record.state === 'queued' || record.state === 'downloading')) await this.save({ ...record, state: 'paused' })
  }

  async resume(fileId: number): Promise<DownloadRecord> {
    const record = await this.get(fileId)
    if (!record) throw new Error(`No download for file ${fileId}`)
    if (record.state === 'completed' && !record.stale) return record
    const next: DownloadRecord =
      record.state === 'completed'
        ? { ...record, state: 'queued', bytesDownloaded: 0, stale: false, completedAt: null, attempts: 0, failure: null, error: null }
        : { ...record, state: 'queued', attempts: 0, failure: null, error: null }
    await this.save(next)
    void this.pump()
    return next
  }

  /** Drops the record and the file. A download in progress is stopped first. */
  async remove(fileId: number): Promise<void> {
    const controller = this.active.get(fileId)
    controller?.abort('remove')
    clearTimeout(this.retryTimers.get(fileId))
    this.retryTimers.delete(fileId)
    this.live.delete(fileId)
    await inTransaction(this.db, [STORES.downloads], 'readwrite', (tx) => {
      tx.objectStore(STORES.downloads).delete(fileId)
    })
    await this.files.remove(downloadStorageKey(fileId))
    this.emit(true)
  }

  /** The downloaded file, if there is a complete one. A stale copy still opens. */
  async openFile(fileId: number): Promise<Blob | null> {
    const record = await this.get(fileId)
    if (!record || record.state !== 'completed') return null
    return this.files.read(downloadStorageKey(fileId))
  }

  /** Marks downloads whose file the server now describes differently, or no longer has. */
  async markChecked(fileId: number, result: { stale: boolean }): Promise<void> {
    const record = await this.get(fileId)
    if (!record) return
    await this.save({ ...record, stale: result.stale, checkedAt: new Date().toISOString() })
  }

  async storageStatus(): Promise<StorageStatus> {
    const estimate = await (this.options.estimate ?? (() => navigator.storage?.estimate?.() ?? Promise.resolve({})))().catch(
      () => ({}) as { usage?: number; quota?: number },
    )
    const persisted = typeof navigator !== 'undefined' && navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => null) : null
    return { usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted }
  }

  /** Starts queued downloads up to the concurrency limit. Safe to call any time. */
  async pump(): Promise<void> {
    if (this.disposed) return
    if (this.options.isOnline && !this.options.isOnline()) return
    const queued = (await this.list()).filter(
      (record) => record.state === 'queued' && !this.active.has(record.fileId) && !this.retryTimers.has(record.fileId),
    )
    for (const record of queued) {
      if (this.active.size >= MAX_CONCURRENT_DOWNLOADS) break
      void this.run(record)
    }
  }

  private async run(initial: DownloadRecord): Promise<void> {
    const controller = new AbortController()
    this.active.set(initial.fileId, controller)
    let record: DownloadRecord = { ...initial, state: 'downloading', attempts: initial.attempts + 1, failure: null, error: null }
    await this.save(record)
    const key = downloadStorageKey(record.fileId)
    try {
      await this.ensureRoomFor(record)
      record = await this.transfer(record, key, controller.signal)
      await this.files.close(key)
      const stored = await this.files.size(key)
      if (stored !== record.sizeBytes) throw new DownloadError('storage', `Stored ${stored} of ${record.sizeBytes} bytes`)
      record = { ...record, state: 'completed', completedAt: new Date().toISOString(), stale: false, checkedAt: new Date().toISOString() }
      await this.save(record)
      this.active.delete(record.fileId)
      await Promise.resolve(this.options.onCompleted?.(record)).catch(() => undefined)
    } catch (error) {
      await this.files.close(key).catch(() => undefined)
      this.active.delete(record.fileId)
      if (controller.signal.aborted) return
      await this.handleFailure(record, error)
    } finally {
      this.active.delete(record.fileId)
      void this.pump()
    }
  }

  private async transfer(start: DownloadRecord, key: string, signal: AbortSignal): Promise<DownloadRecord> {
    let record = start
    // Anything past the persisted offset was written but never confirmed; drop it and redo it.
    await this.files.truncate(key, record.bytesDownloaded)
    let restarted = false
    while (record.sizeBytes === 0 || record.bytesDownloaded < record.sizeBytes) {
      const offset = record.bytesDownloaded
      const chunk = this.options.chunkBytes ?? DOWNLOAD_CHUNK_BYTES
      const end = record.sizeBytes > 0 ? Math.min(offset + chunk, record.sizeBytes) - 1 : offset + chunk - 1
      let response: Response
      let total: number | null
      try {
        response = await this.fetchRange(record.fileId, offset, end, signal)
        signal.throwIfAborted()
        total = totalSize(response)
      } catch (error) {
        // The recorded size was unknown or wrong, so the range ran past the end; the reply names
        // the real size, and the download starts over at it.
        if (!(error instanceof DownloadError) || error.actualSize === null || restarted) throw error
        response = null as never
        total = error.actualSize
      }
      if (total === null) throw new DownloadError('server', 'The server did not report the file size')

      const replaced = response === null || (record.sizeBytes > 0 && total !== record.sizeBytes)
      const rangeIgnored = response?.status === 200 && offset > 0
      if (replaced || rangeIgnored) {
        await response?.body?.cancel().catch(() => undefined)
        if (restarted) throw new DownloadError('changed', 'The file changed on the server during download')
        restarted = true
        record = { ...record, sizeBytes: total, bytesDownloaded: 0 }
        await this.files.truncate(key, 0)
        await this.save(record)
        continue
      }
      if (record.sizeBytes === 0) record = { ...record, sizeBytes: total }

      let position = offset
      const reader = response.body!.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (signal.aborted) {
          await reader.cancel().catch(() => undefined)
          signal.throwIfAborted()
        }
        // Read the length first: the OPFS store transfers the buffer to its worker, emptying it here.
        const length = value.byteLength
        await this.files.write(key, position, value)
        position += length
        this.live.set(record.fileId, { ...record, bytesDownloaded: position })
        this.emit(false)
      }
      if (response.status === 206 && position !== end + 1) throw new DownloadError('network', 'The connection closed mid-chunk')
      await this.files.flush(key)
      record = { ...record, bytesDownloaded: position, updatedAt: new Date().toISOString() }
      await this.save(record)
      if (total === 0) break
    }
    return record
  }

  /** Fails early when the browser says the rest of the file cannot fit, instead of at the last chunk. */
  private async ensureRoomFor(record: DownloadRecord) {
    if (record.sizeBytes <= 0) return
    const { usage, quota } = await this.storageStatus()
    if (usage === null || quota === null) return
    if (quota - usage < record.sizeBytes - record.bytesDownloaded) throw new DownloadError('quota', 'Not enough storage space for this book')
  }

  private async fetchRange(fileId: number, start: number, end: number, signal: AbortSignal): Promise<Response> {
    let response: Response
    try {
      response = await this.request(`/api/v1/books/files/${fileId}/serve`, { headers: { Range: `bytes=${start}-${end}` }, signal, cache: 'no-store' })
    } catch (error) {
      if (signal.aborted) throw error
      if (isServerUnreachable(error)) throw new DownloadError('network', 'The server could not be reached')
      throw error
    }
    if (response.status === 206 || response.status === 200) return response
    if (response.status === 404 || response.status === 403) throw new DownloadError('gone', 'The file is no longer on the server')
    if (response.status === 416) {
      const match = /\*\/(\d+)$/.exec(response.headers.get('content-range') ?? '')
      throw new DownloadError('changed', 'The file changed on the server during download', match ? Number(match[1]) : null)
    }
    if (response.status >= 500 || response.status === 408 || response.status === 429)
      throw new DownloadError('network', `The server answered ${response.status}`)
    throw new DownloadError('server', `The server answered ${response.status}`)
  }

  private async handleFailure(record: DownloadRecord, error: unknown) {
    const failure = classify(error)
    const message = error instanceof Error ? error.message : String(error)
    const retryable = failure === 'network' && record.attempts < MAX_AUTOMATIC_ATTEMPTS
    const confirmed = await this.get(record.fileId)
    const base = { ...record, bytesDownloaded: confirmed?.bytesDownloaded ?? record.bytesDownloaded }
    this.live.delete(record.fileId)
    if (!retryable) {
      await this.save({ ...base, state: 'failed', failure, error: message })
      return
    }
    await this.save({ ...base, state: 'queued', failure, error: message })
    const delay = (this.options.retryDelayMs ?? defaultRetryDelay)(record.attempts)
    const timer = setTimeout(() => {
      this.retryTimers.delete(record.fileId)
      void this.pump()
    }, delay)
    this.retryTimers.set(record.fileId, timer)
  }

  /** Wakes downloads waiting out a retry delay, for when the connection comes back. */
  retryNow() {
    for (const timer of this.retryTimers.values()) clearTimeout(timer)
    this.retryTimers.clear()
    void this.pump()
  }

  private async save(record: DownloadRecord) {
    if (this.disposed) return
    const next = { ...record, updatedAt: new Date().toISOString() }
    this.live.delete(record.fileId)
    await inTransaction(this.db, [STORES.downloads], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.downloads)
      const stored = (await requestResult(store.get(record.fileId))) as DownloadRecord | undefined
      // A removal or pause while this download was in flight wins over its own late writes.
      if (!stored) return
      store.put(stored.state === 'paused' && next.state === 'downloading' ? { ...next, state: 'paused' } : next)
    })
    this.emit(true)
  }

  private emit(force: boolean) {
    if (this.disposed) return
    const now = Date.now()
    if (!force && now - this.lastNotifyAt < PROGRESS_NOTIFY_INTERVAL_MS) return
    this.lastNotifyAt = now
    void this.list().then(
      (records) => {
        for (const listener of this.listeners) listener(records)
      },
      () => undefined,
    )
  }
}

function totalSize(response: Response): number | null {
  if (response.status === 206) {
    const match = /\/(\d+)$/.exec(response.headers.get('content-range') ?? '')
    return match ? Number(match[1]) : null
  }
  const length = response.headers.get('content-length')
  return length === null ? null : Number(length)
}

function classify(error: unknown): DownloadFailure {
  if (error instanceof DownloadError) return error.failure
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'quota'
  if (isServerUnreachable(error)) return 'network'
  if (error instanceof TypeError) return 'network'
  return 'storage'
}

function defaultRetryDelay(attempt: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt - 1))
}
