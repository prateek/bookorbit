import { reactive, shallowReadonly } from 'vue'
import type { BookDetail } from '@bookorbit/types'
import { api } from '@/lib/api'
import { DownloadManager, type StorageStatus } from './lib/download-manager'
import { isOpfsSupported, MemoryBookFileStore, OpfsBookFileStore, type BookFileStore } from './lib/file-store'
import { inTransaction, requestResult } from './lib/idb'
import { deleteOfflineDb, openOfflineDb, STORES, type BookSnapshot, type DownloadRecord } from './lib/offline-db'
import { ReaderReplica } from './lib/replica'
import { readFailureLog, SyncEngine, type PushOutcome, type SyncFailure } from './lib/sync-engine'
import { warmReaderEngine } from './lib/warm-reader'

/**
 * One signed-in user's offline state: the reader replica, the outbox sync, and the downloads. All
 * of it is best-effort around the network and exact about local state: a write is recorded before
 * anything is sent, and nothing here relies on the page running in the background. Syncs happen
 * when the app starts, returns to the foreground, regains a connection, opens or closes a book, and
 * shortly after each local write.
 */

const SYNC_DEBOUNCE_MS = 2_000
const PERIODIC_SYNC_MS = 60_000
const BOOK_REFRESH_INTERVAL_MS = 10 * 60_000
/** Beyond the downloads, how many recently opened books a sync keeps current for reading online. */
const RECENT_BOOKS_TO_REFRESH = 5
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const MAX_BACKOFF_MS = 5 * 60_000
const RECENT_BOOKS_KEY = 'recentBooks'
const RECENT_BOOKS_LIMIT = 10
const DEVICE_ID_KEY = 'deviceId'
const LAST_SYNC_KEY = 'lastSyncAt'

export interface OfflineStatus {
  ready: boolean
  supported: boolean
  deviceId: string | null
  syncing: boolean
  lastSyncAt: string | null
  lastOutcome: PushOutcome | null
  lastError: string | null
  outboxCount: number
  failures: SyncFailure[]
  downloads: DownloadRecord[]
  storage: StorageStatus
}

const status = reactive<OfflineStatus>({
  ready: false,
  supported: typeof indexedDB !== 'undefined',
  deviceId: null,
  syncing: false,
  lastSyncAt: null,
  lastOutcome: null,
  lastError: null,
  outboxCount: 0,
  failures: [],
  downloads: [],
  storage: { usage: null, quota: null, persisted: null },
})

export interface OfflineSession {
  userId: number
  replica: ReaderReplica
  engine: SyncEngine
  downloads: DownloadManager
  files: BookFileStore
}

let session: OfflineSession | null = null
let opening: Promise<OfflineSession | null> | null = null
let openingUserId: number | null = null
/** Bumped by every start and stop, so an open that outlived a later sign-in can tell and stand down. */
let generation = 0
let syncTimer: ReturnType<typeof setTimeout> | null = null
let periodicTimer: ReturnType<typeof setInterval> | null = null
let backoffMs = 0
let syncing: Promise<void> | null = null
const lastBookRefresh = new Map<number, number>()
const cleanups: Array<() => void> = []

export function useOfflineStatus() {
  return shallowReadonly(status)
}

export function currentOfflineSession(): OfflineSession | null {
  return session
}

/** Resolves once the session for the signed-in user is open, or null where the browser cannot hold one. */
export function whenOfflineSession(): Promise<OfflineSession | null> {
  if (session) return Promise.resolve(session)
  return opening ?? Promise.resolve(null)
}

export function startOfflineSession(userId: number): Promise<OfflineSession | null> {
  if (session?.userId === userId) return Promise.resolve(session)
  if (opening && openingUserId === userId) return opening
  openingUserId = userId
  opening = (async () => {
    await stopOfflineSession()
    const mine = ++generation
    const superseded = () => generation !== mine
    if (!status.supported) return null
    let replica: ReaderReplica | null = null
    let downloads: DownloadManager | null = null
    try {
      const db = await openOfflineDb(userId)
      if (superseded()) {
        db.close()
        return null
      }
      replica = new ReaderReplica(db, userId)
      const files: BookFileStore = isOpfsSupported() ? new OpfsBookFileStore(userId) : new MemoryBookFileStore()
      downloads = new DownloadManager(db, files, {
        isOnline: () => navigator.onLine !== false,
        onCompleted: (record) => afterDownload(record),
      })
      const next: OfflineSession = { userId, replica, engine: new SyncEngine(replica), downloads, files }
      const deviceId = await ensureDeviceId(replica)
      const lastSyncAt = (await replica.getMeta<string>(LAST_SYNC_KEY)) ?? null
      if (superseded()) throw new Superseded()
      session = next
      status.deviceId = deviceId
      status.lastSyncAt = lastSyncAt
      cleanups.push(replica.subscribe((change) => (change.scope === 'outbox' ? void refreshCounts() : undefined)))
      cleanups.push(downloads.subscribe((records) => (status.downloads = records)))
      installTriggers()
      status.ready = true
      await refreshCounts()
      status.downloads = await downloads.list()
      void refreshStorage()
      await downloads.start()
      requestSync('launch', 0)
      return next
    } catch (error) {
      if (error instanceof Superseded || superseded()) {
        downloads?.dispose()
        replica?.close()
        return null
      }
      status.lastError = error instanceof Error ? error.message : String(error)
      return null
    } finally {
      if (openingUserId === userId) {
        opening = null
        openingUserId = null
      }
    }
  })()
  return opening
}

class Superseded extends Error {}

export async function stopOfflineSession(): Promise<void> {
  generation += 1
  if (syncTimer) clearTimeout(syncTimer)
  if (periodicTimer) clearInterval(periodicTimer)
  syncTimer = null
  periodicTimer = null
  for (const cleanup of cleanups.splice(0)) cleanup()
  const current = session
  session = null
  status.ready = false
  status.downloads = []
  status.outboxCount = 0
  status.failures = []
  if (current) {
    current.downloads.dispose()
    current.replica.close()
  }
}

/** How long sign-out waits for queued writes to go out before it carries on without them. */
const SIGN_OUT_PUSH_TIMEOUT_MS = 5_000

/**
 * Signing out removes this user's replica and downloaded files from the device, after one last,
 * bounded attempt to deliver what is queued. Writes that still could not be sent are kept rather
 * than silently discarded, and go out the next time this user signs in here.
 */
export async function signOutOfflineSession(): Promise<void> {
  const current = session
  if (!current) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = null
  await Promise.race([
    (syncing ?? Promise.resolve()).then(() => current.engine.push(50)).catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, SIGN_OUT_PUSH_TIMEOUT_MS)),
  ])
  const pending = await current.replica.countOutbox().catch(() => 0)
  const records = await current.downloads.list().catch(() => [])
  for (const record of records) await current.downloads.remove(record.fileId).catch(() => undefined)
  await stopOfflineSession()
  if (pending === 0) await deleteOfflineDb(current.userId).catch(() => undefined)
}

/** Debounced; `delayMs` 0 runs on the next tick. */
export function requestSync(_reason: string, delayMs = SYNC_DEBOUNCE_MS) {
  if (!session) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(
    () => {
      syncTimer = null
      void runSync(_reason)
    },
    Math.max(delayMs, backoffMs),
  )
}

/** Pushes the outbox, then refreshes the books this device reads offline. One run at a time across tabs. */
export async function runSync(reason: string): Promise<void> {
  if (!session) return
  if (syncing) return syncing
  syncing = withCrossTabLock(async () => {
    const current = session
    if (!current) return
    status.syncing = true
    try {
      const outcome = await current.engine.push()
      status.lastOutcome = outcome
      if (outcome === 'drained' || outcome === 'budget') {
        // Other devices' changes are pulled when the app comes back, not after every page turn.
        if (reason === 'launch' || reason === 'foreground' || reason === 'online' || reason === 'manual') {
          await refreshTrackedBooks(current)
          await checkDownloadsForUpdates(current)
        }
        backoffMs = 0
        status.lastError = null
        status.lastSyncAt = new Date().toISOString()
        await current.replica.setMeta(LAST_SYNC_KEY, status.lastSyncAt)
        if (outcome === 'budget') requestSync('continue', 0)
      } else if (outcome !== 'unauthenticated') {
        backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs ? backoffMs * 2 : 5_000)
        requestSync('retry')
      }
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : String(error)
      backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs ? backoffMs * 2 : 5_000)
      requestSync('retry')
    } finally {
      status.syncing = false
      await refreshCounts()
    }
  }).finally(() => {
    syncing = null
  })
  return syncing
}

/**
 * Remembers a book as one this device reads, so later syncs keep its annotations, bookmarks and
 * position current even when it is not downloaded. Also refreshes it now when online.
 */
export async function trackOpenedBook(bookId: number, fileId: number): Promise<void> {
  const current = await whenOfflineSession()
  if (!current) return
  const recent = ((await current.replica.getMeta<Array<{ bookId: number; fileId: number }>>(RECENT_BOOKS_KEY)) ?? []).filter(
    (book) => book.bookId !== bookId,
  )
  recent.unshift({ bookId, fileId })
  await current.replica.setMeta(RECENT_BOOKS_KEY, recent.slice(0, RECENT_BOOKS_LIMIT))
  if (navigator.onLine === false) return
  await current.engine.refreshBook(bookId, [fileId]).then(
    () => lastBookRefresh.set(bookId, Date.now()),
    () => undefined,
  )
}

export async function getBookSnapshot(bookId: number): Promise<BookSnapshot | null> {
  const current = await whenOfflineSession()
  if (!current) return null
  return inTransaction(
    current.replica.db,
    [STORES.books],
    'readonly',
    async (tx) => ((await requestResult(tx.objectStore(STORES.books).get(bookId))) as BookSnapshot | undefined) ?? null,
  )
}

/** The downloaded copy of a file, for the reader to open without the network. */
export async function openDownloadedFile(fileId: number): Promise<Blob | null> {
  const current = await whenOfflineSession()
  if (!current) return null
  return current.downloads.openFile(fileId).catch(() => null)
}

/** Queues a download. Call from a user gesture: it also asks the browser to keep this site's storage. */
export async function downloadBookFile(detail: BookDetail, fileId: number): Promise<DownloadRecord | null> {
  const current = await whenOfflineSession()
  if (!current) return null
  void requestPersistentStorage()
  const file = detail.files.find((candidate) => candidate.id === fileId)
  const cover = await fetchCover(detail.id)
  const record = await current.downloads.enqueue(
    {
      bookId: detail.id,
      fileId,
      format: (file?.format ?? 'epub').toLowerCase(),
      title: detail.title ?? detail.files[0]?.filename ?? `Book ${detail.id}`,
      authors: detail.authors.map((author) => author.name),
      sizeBytes: file?.sizeBytes ?? null,
    },
    // Components hand over a reactive proxy, which IndexedDB cannot store; keep a plain copy.
    { bookId: detail.id, detail: JSON.parse(JSON.stringify(detail)) as BookDetail, cover },
  )
  await trackOpenedBook(detail.id, fileId)
  return record
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null
  const persisted = await navigator.storage.persist().catch(() => null)
  await refreshStorage()
  return persisted
}

export async function refreshStorage(): Promise<void> {
  if (!session) return
  status.storage = await session.downloads.storageStatus()
}

async function refreshCounts() {
  if (!session) return
  status.outboxCount = await session.replica.countOutbox().catch(() => status.outboxCount)
  status.failures = await readFailureLog(session.replica).catch(() => status.failures)
}

async function refreshTrackedBooks(current: OfflineSession) {
  if (navigator.onLine === false) return
  const recent = (await current.replica.getMeta<Array<{ bookId: number; fileId: number }>>(RECENT_BOOKS_KEY)) ?? []
  const byBook = new Map<number, Set<number>>()
  for (const book of recent.slice(0, RECENT_BOOKS_TO_REFRESH)) byBook.set(book.bookId, new Set([book.fileId]))
  for (const record of await current.downloads.list()) {
    const files = byBook.get(record.bookId) ?? new Set<number>()
    files.add(record.fileId)
    byBook.set(record.bookId, files)
  }
  const now = Date.now()
  for (const [bookId, files] of byBook) {
    if (now - (lastBookRefresh.get(bookId) ?? 0) < BOOK_REFRESH_INTERVAL_MS) continue
    await current.engine.refreshBook(bookId, [...files])
    lastBookRefresh.set(bookId, now)
  }
}

/**
 * The file endpoints carry no version, so a download is compared with the book's current file list:
 * a file that is gone, or whose size changed, marks the downloaded copy stale. It stays readable.
 */
async function checkDownloadsForUpdates(current: OfflineSession) {
  const due = (await current.downloads.list()).filter(
    (record) => record.state === 'completed' && (!record.checkedAt || Date.now() - Date.parse(record.checkedAt) > UPDATE_CHECK_INTERVAL_MS),
  )
  for (const record of due) {
    const response = await api(`/api/v1/books/${record.bookId}`)
    if (response.status === 404 || response.status === 403) {
      await current.downloads.markChecked(record.fileId, { stale: true })
      continue
    }
    if (!response.ok) continue
    const detail = (await response.json()) as BookDetail
    const file = detail.files.find((candidate) => candidate.id === record.fileId)
    await current.downloads.markChecked(record.fileId, { stale: !file || (file.sizeBytes != null && file.sizeBytes !== record.sizeBytes) })
  }
}

async function afterDownload(record: DownloadRecord) {
  await warmReaderEngine(record.format)
  await refreshStorage()
  if (session) await session.engine.refreshBook(record.bookId, [record.fileId]).catch(() => undefined)
}

async function fetchCover(bookId: number): Promise<Blob | null> {
  try {
    const response = await api(`/api/v1/books/${bookId}/thumbnail`)
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}

async function ensureDeviceId(replica: ReaderReplica): Promise<string> {
  const existing = await replica.getMeta<string>(DEVICE_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  await replica.setMeta(DEVICE_ID_KEY, id)
  return id
}

function installTriggers() {
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      requestSync('foreground', 0)
      session?.downloads.retryNow()
    }
  }
  const onOnline = () => {
    backoffMs = 0
    requestSync('online', 0)
    session?.downloads.retryNow()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  const unsubscribe = session!.replica.subscribe((change) => {
    if (change.scope === 'outbox') requestSync('local-change')
  })
  periodicTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && status.outboxCount > 0) requestSync('periodic', 0)
  }, PERIODIC_SYNC_MS)
  cleanups.push(() => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    unsubscribe()
  })
}

async function withCrossTabLock(body: () => Promise<void>): Promise<void> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (!locks) return body()
  await locks.request('bookorbit-offline-sync', { ifAvailable: true }, async (lock) => {
    // Another tab is already syncing; its writes reach this tab through the replica channel.
    if (lock) await body()
  })
}
