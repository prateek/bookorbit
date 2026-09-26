import type { AnnotationItem, AnnotationPdfPosition } from '@bookorbit/types'
import { deleteDatabase, openDatabase } from './idb'

/**
 * The installed app's local replica, one database per user so switching accounts on a shared
 * device never mixes their reading state. Reader state lives here first and reaches the server
 * through the outbox; book files live in OPFS and are only described here.
 */

export const OFFLINE_DB_VERSION = 1

export const STORES = {
  meta: 'meta',
  progress: 'progress',
  annotations: 'annotations',
  bookmarks: 'bookmarks',
  outbox: 'outbox',
  downloads: 'downloads',
  books: 'books',
} as const

export interface LocalProgress {
  fileId: number
  bookId: number
  percentage: number
  cfi: string | null
  pageNumber: number | null
  positionSeconds: number | null
  mediaOverlayFragment: string | null
  mediaOverlaySectionIndex: number | null
  koboLocationSource: string | null
  koboLocationType: string | null
  koboLocationValue: string | null
  koboContentSourceProgressPercent: number | null
  koreaderProgress: string | null
  source: 'text' | 'narration'
  /** When this position was read: the local clock for local writes, the server's `lastReadAt` otherwise. */
  readAt: string
  /** Which clock stamped `readAt`. Absent means the device's; the replica sets it. */
  readAtSource?: 'device' | 'server'
}

/**
 * `id` is the server id once known and a negative placeholder before, so reader components keyed
 * by id keep working offline. `clientId` is the stable identity across both.
 */
export type LocalAnnotation = AnnotationItem & {
  clientId: string
  serverId: number | null
  bookFileId: number | null
  deleted: boolean
}

export interface LocalBookmark {
  clientId: string
  id: number
  serverId: number | null
  bookId: number
  cfi: string
  title: string
  createdAt: string
  deleted: boolean
}

export type SaveProgressBody = Omit<LocalProgress, 'fileId' | 'bookId' | 'readAt'>

export interface SaveSessionBody {
  sessionId: string
  startedAt: string
  endedAt: string
  durationSeconds: number
  progressDelta?: number | null
  endProgress?: number | null
  sessionType?: 'read' | 'tts' | 'listen'
}

export interface CreateAnnotationBody {
  cfi?: string
  pdf?: AnnotationPdfPosition
  bookFileId?: number
  text: string
  color: string
  style: string
  note?: string | null
  chapterTitle?: string | null
}

export interface AnnotationPatch {
  note?: string | null
  color?: string
  style?: string
}

/**
 * One queued write, replayed in `seq` order against the same REST endpoints the web reader and the
 * native apps use. `sending` is persisted before a request goes out, so an entry found with it set
 * after a restart is known to have an unknown outcome.
 */
export type OutboxEntry = { seq?: number; capturedAt: string; attempts: number; sending: boolean; lastError?: string } & (
  | { kind: 'progress'; fileId: number; bookId: number; body: SaveProgressBody }
  | { kind: 'session'; fileId: number; bookId: number; body: SaveSessionBody }
  | { kind: 'annotation.create'; bookId: number; clientId: string; body: CreateAnnotationBody }
  | { kind: 'annotation.update'; bookId: number; clientId: string; patch: AnnotationPatch }
  | { kind: 'annotation.delete'; bookId: number; clientId: string }
  | { kind: 'bookmark.create'; bookId: number; clientId: string; cfi: string; title: string }
  | { kind: 'bookmark.delete'; bookId: number; clientId: string }
)

export type OutboxKind = OutboxEntry['kind']

export type DownloadState = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'
export type DownloadFailure = 'network' | 'quota' | 'storage' | 'server' | 'gone' | 'changed'

export interface DownloadRecord {
  fileId: number
  bookId: number
  format: string
  title: string
  authors: string[]
  /** Size the server reported for the file; a download only completes at exactly this many bytes. */
  sizeBytes: number
  bytesDownloaded: number
  state: DownloadState
  failure: DownloadFailure | null
  error: string | null
  attempts: number
  /** The server's copy no longer matches the downloaded one; reading still works from the old copy. */
  stale: boolean
  createdAt: string
  updatedAt: string
  completedAt: string | null
  checkedAt: string | null
}

/** What the reader needs to open a book with no server: the detail it would otherwise fetch. */
export interface BookSnapshot {
  bookId: number
  detail: unknown
  cover: Blob | null
  savedAt: string
}

export interface MetaRecord {
  key: string
  value: unknown
}

export function offlineDbName(userId: number): string {
  return `bookorbit-offline-${userId}`
}

export function openOfflineDb(userId: number): Promise<IDBDatabase> {
  return openDatabase(offlineDbName(userId), OFFLINE_DB_VERSION, (db, oldVersion) => {
    if (oldVersion < 1) {
      db.createObjectStore(STORES.meta, { keyPath: 'key' })
      const progress = db.createObjectStore(STORES.progress, { keyPath: 'fileId' })
      progress.createIndex('bookId', 'bookId')
      const annotations = db.createObjectStore(STORES.annotations, { keyPath: 'clientId' })
      annotations.createIndex('bookId', 'bookId')
      annotations.createIndex('serverId', 'serverId')
      const bookmarks = db.createObjectStore(STORES.bookmarks, { keyPath: 'clientId' })
      bookmarks.createIndex('bookId', 'bookId')
      bookmarks.createIndex('serverId', 'serverId')
      db.createObjectStore(STORES.outbox, { keyPath: 'seq', autoIncrement: true })
      db.createObjectStore(STORES.downloads, { keyPath: 'fileId' })
      db.createObjectStore(STORES.books, { keyPath: 'bookId' })
    }
  })
}

export function deleteOfflineDb(userId: number): Promise<void> {
  return deleteDatabase(offlineDbName(userId))
}
