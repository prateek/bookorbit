import type { AnnotationItem } from '@bookorbit/types'
import { inTransaction, requestResult } from './idb'
import {
  STORES,
  type AnnotationPatch,
  type CreateAnnotationBody,
  type LocalAnnotation,
  type LocalBookmark,
  type LocalProgress,
  type MetaRecord,
  type OutboxEntry,
  type SaveSessionBody,
} from './offline-db'

/** Written by the sync engine: server clock minus device clock, in milliseconds. */
export const CLOCK_SKEW_META_KEY = 'clockSkewMs'

export type ReplicaChange = { scope: 'progress' | 'annotations' | 'bookmarks'; bookId: number } | { scope: 'outbox' }

type Outboxed<E> = E extends unknown ? Omit<E, 'seq' | 'attempts' | 'sending' | 'lastError'> : never
type NewOutboxEntry = Outboxed<OutboxEntry>

const CHANNEL_NAME = 'bookorbit-offline-replica'

function nowIso(): string {
  return new Date().toISOString()
}

function newClientId(): string {
  return crypto.randomUUID()
}

/** Negative, so it can never collide with a server id, and random, so two tabs never collide either. */
function placeholderId(): number {
  const bytes = new Uint32Array(2)
  crypto.getRandomValues(bytes)
  return -((bytes[0]! & 0x1fffff) * 0x100000000 + bytes[1]! || 1)
}

/**
 * Local reader state. Every user action is one transaction that updates the materialized record
 * and appends the matching outbox entry, so the two can never disagree after a crash. Writes are
 * coalesced with outbox entries that have not been sent yet, which keeps the outbox proportional to
 * what actually changed rather than to how many times the page turned.
 */
export class ReaderReplica {
  private readonly listeners = new Set<(change: ReplicaChange) => void>()
  private readonly channel: BroadcastChannel | null

  constructor(
    readonly db: IDBDatabase,
    readonly userId: number,
  ) {
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`${CHANNEL_NAME}-${userId}`)
    if (this.channel) this.channel.onmessage = (event: MessageEvent<ReplicaChange>) => this.notifyLocal(event.data)
  }

  close() {
    this.channel?.close()
    this.db.close()
  }

  /** Fires for changes made by this tab and by any other tab of the same user. */
  subscribe(listener: (change: ReplicaChange) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyLocal(change: ReplicaChange) {
    for (const listener of this.listeners) listener(change)
  }

  notify(...changes: ReplicaChange[]) {
    for (const change of changes) {
      this.notifyLocal(change)
      this.channel?.postMessage(change)
    }
  }

  // Progress

  getProgress(fileId: number): Promise<LocalProgress | null> {
    return inTransaction(
      this.db,
      [STORES.progress],
      'readonly',
      async (tx) => (await requestResult(tx.objectStore(STORES.progress).get(fileId))) ?? null,
    )
  }

  async recordProgress(progress: LocalProgress): Promise<void> {
    await inTransaction(this.db, [STORES.progress, STORES.outbox], 'readwrite', async (tx) => {
      tx.objectStore(STORES.progress).put({ ...progress, readAtSource: 'device' } satisfies LocalProgress)
      const outbox = tx.objectStore(STORES.outbox)
      for (const entry of await unsentEntries(outbox)) {
        if (entry.kind === 'progress' && entry.fileId === progress.fileId) outbox.delete(entry.seq!)
      }
      const { fileId, bookId, readAt, ...body } = progress
      append(outbox, { kind: 'progress', fileId, bookId, capturedAt: readAt, body })
    })
    this.notify({ scope: 'progress', bookId: progress.bookId }, { scope: 'outbox' })
  }

  // Reading sessions

  async recordSession(fileId: number, bookId: number, body: SaveSessionBody): Promise<void> {
    await inTransaction(this.db, [STORES.outbox], 'readwrite', (tx) => {
      append(tx.objectStore(STORES.outbox), { kind: 'session', fileId, bookId, capturedAt: body.endedAt, body })
    })
    this.notify({ scope: 'outbox' })
  }

  // Annotations

  async listAnnotations(bookId: number): Promise<LocalAnnotation[]> {
    const rows = await this.annotationsForBook(bookId)
    return rows.filter((row) => !row.deleted).sort((a, b) => a.highlightedAt.localeCompare(b.highlightedAt))
  }

  listAnnotationsIncludingDeleted(bookId: number): Promise<LocalAnnotation[]> {
    return this.annotationsForBook(bookId)
  }

  listBookmarksIncludingDeleted(bookId: number): Promise<LocalBookmark[]> {
    return inTransaction(this.db, [STORES.bookmarks], 'readonly', (tx) =>
      requestResult(tx.objectStore(STORES.bookmarks).index('bookId').getAll(bookId) as IDBRequest<LocalBookmark[]>),
    )
  }

  private annotationsForBook(bookId: number): Promise<LocalAnnotation[]> {
    return inTransaction(this.db, [STORES.annotations], 'readonly', (tx) =>
      requestResult(tx.objectStore(STORES.annotations).index('bookId').getAll(bookId) as IDBRequest<LocalAnnotation[]>),
    )
  }

  async createAnnotation(bookId: number, body: CreateAnnotationBody): Promise<LocalAnnotation> {
    const clientId = newClientId()
    const at = nowIso()
    const annotation: LocalAnnotation = {
      id: placeholderId(),
      clientId,
      serverId: null,
      bookId,
      bookFileId: body.bookFileId ?? null,
      cfi: body.cfi ?? null,
      jumpFileId: body.bookFileId ?? null,
      pageno: body.pdf ? body.pdf.page + 1 : null,
      text: body.text,
      color: body.color,
      style: body.style,
      note: body.note ?? null,
      chapterTitle: body.chapterTitle ?? null,
      origin: 'web',
      positionStatus: 'exact',
      chapterIndex: null,
      highlightedAt: at,
      createdAt: at,
      updatedAt: at,
      pdf: body.pdf ?? null,
      deleted: false,
    }
    await inTransaction(this.db, [STORES.annotations, STORES.outbox], 'readwrite', (tx) => {
      tx.objectStore(STORES.annotations).put(annotation)
      append(tx.objectStore(STORES.outbox), { kind: 'annotation.create', bookId, clientId, capturedAt: at, body })
    })
    this.notify({ scope: 'annotations', bookId }, { scope: 'outbox' })
    return annotation
  }

  async updateAnnotation(bookId: number, id: number, patch: AnnotationPatch): Promise<LocalAnnotation | null> {
    const at = nowIso()
    const updated = await inTransaction(this.db, [STORES.annotations, STORES.outbox], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.annotations)
      const rows = (await requestResult(store.index('bookId').getAll(bookId))) as LocalAnnotation[]
      const current = rows.find((row) => row.id === id && !row.deleted)
      if (!current) return null
      const next: LocalAnnotation = { ...current, ...patch, updatedAt: at }
      store.put(next)

      const outbox = tx.objectStore(STORES.outbox)
      const unsent = (await unsentEntries(outbox)).filter((entry) => 'clientId' in entry && entry.clientId === current.clientId)
      const create = unsent.find((entry) => entry.kind === 'annotation.create')
      if (create && create.kind === 'annotation.create') {
        outbox.put({ ...create, body: { ...create.body, ...patch } })
        return next
      }
      const pending = unsent.find((entry) => entry.kind === 'annotation.update')
      if (pending && pending.kind === 'annotation.update') {
        outbox.put({ ...pending, capturedAt: at, patch: { ...pending.patch, ...patch } })
        return next
      }
      append(outbox, { kind: 'annotation.update', bookId, clientId: current.clientId, capturedAt: at, patch })
      return next
    })
    if (updated) this.notify({ scope: 'annotations', bookId }, { scope: 'outbox' })
    return updated
  }

  async deleteAnnotation(bookId: number, id: number): Promise<boolean> {
    const at = nowIso()
    const deleted = await inTransaction(this.db, [STORES.annotations, STORES.outbox], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.annotations)
      const rows = (await requestResult(store.index('bookId').getAll(bookId))) as LocalAnnotation[]
      const current = rows.find((row) => row.id === id && !row.deleted)
      if (!current) return false

      const outbox = tx.objectStore(STORES.outbox)
      const unsent = (await unsentEntries(outbox)).filter((entry) => 'clientId' in entry && entry.clientId === current.clientId)
      for (const entry of unsent) outbox.delete(entry.seq!)
      const createNeverSent = current.serverId === null && unsent.some((entry) => entry.kind === 'annotation.create')
      if (createNeverSent) {
        store.delete(current.clientId)
      } else {
        store.put({ ...current, deleted: true, updatedAt: at })
        append(outbox, { kind: 'annotation.delete', bookId, clientId: current.clientId, capturedAt: at })
      }
      return true
    })
    if (deleted) this.notify({ scope: 'annotations', bookId }, { scope: 'outbox' })
    return deleted
  }

  // Bookmarks

  async listBookmarks(bookId: number): Promise<LocalBookmark[]> {
    const rows = await inTransaction(this.db, [STORES.bookmarks], 'readonly', (tx) =>
      requestResult(tx.objectStore(STORES.bookmarks).index('bookId').getAll(bookId) as IDBRequest<LocalBookmark[]>),
    )
    return rows.filter((row) => !row.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async createBookmark(bookId: number, cfi: string, title: string): Promise<LocalBookmark> {
    const at = nowIso()
    const bookmark: LocalBookmark = {
      clientId: newClientId(),
      id: placeholderId(),
      serverId: null,
      bookId,
      cfi,
      title,
      createdAt: at,
      deleted: false,
    }
    await inTransaction(this.db, [STORES.bookmarks, STORES.outbox], 'readwrite', (tx) => {
      tx.objectStore(STORES.bookmarks).put(bookmark)
      append(tx.objectStore(STORES.outbox), { kind: 'bookmark.create', bookId, clientId: bookmark.clientId, capturedAt: at, cfi, title })
    })
    this.notify({ scope: 'bookmarks', bookId }, { scope: 'outbox' })
    return bookmark
  }

  async deleteBookmark(bookId: number, id: number): Promise<boolean> {
    const at = nowIso()
    const deleted = await inTransaction(this.db, [STORES.bookmarks, STORES.outbox], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.bookmarks)
      const rows = (await requestResult(store.index('bookId').getAll(bookId))) as LocalBookmark[]
      const current = rows.find((row) => row.id === id && !row.deleted)
      if (!current) return false
      const outbox = tx.objectStore(STORES.outbox)
      const unsent = (await unsentEntries(outbox)).filter((entry) => 'clientId' in entry && entry.clientId === current.clientId)
      for (const entry of unsent) outbox.delete(entry.seq!)
      if (current.serverId === null && unsent.some((entry) => entry.kind === 'bookmark.create')) {
        store.delete(current.clientId)
      } else {
        store.put({ ...current, deleted: true })
        append(outbox, { kind: 'bookmark.delete', bookId, clientId: current.clientId, capturedAt: at })
      }
      return true
    })
    if (deleted) this.notify({ scope: 'bookmarks', bookId }, { scope: 'outbox' })
    return deleted
  }

  // Outbox, for the sync engine

  listOutbox(limit = 50): Promise<OutboxEntry[]> {
    return inTransaction(this.db, [STORES.outbox], 'readonly', (tx) =>
      requestResult(tx.objectStore(STORES.outbox).getAll(null, limit) as IDBRequest<OutboxEntry[]>),
    )
  }

  countOutbox(): Promise<number> {
    return inTransaction(this.db, [STORES.outbox], 'readonly', (tx) => requestResult(tx.objectStore(STORES.outbox).count()))
  }

  /** Persisted before the request goes out; see `OutboxEntry.sending`. */
  async markSending(seq: number): Promise<OutboxEntry | null> {
    return inTransaction(this.db, [STORES.outbox], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.outbox)
      const entry = (await requestResult(store.get(seq))) as OutboxEntry | undefined
      if (!entry) return null
      const next = { ...entry, sending: true, attempts: entry.attempts + 1 }
      store.put(next)
      return next
    })
  }

  async releaseEntry(seq: number, error: string): Promise<void> {
    await inTransaction(this.db, [STORES.outbox], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.outbox)
      const entry = (await requestResult(store.get(seq))) as OutboxEntry | undefined
      if (entry) store.put({ ...entry, sending: false, lastError: error })
    })
  }

  /**
   * Retires an entry and records what the server said, in one transaction. `dropFollowing` also
   * discards every later entry for the same annotation or bookmark, for when the server says it
   * no longer exists and they could only fail.
   */
  async completeEntry(
    entry: OutboxEntry,
    effects: {
      annotation?: Partial<LocalAnnotation> & { clientId: string }
      removeAnnotation?: string
      bookmark?: Partial<LocalBookmark> & { clientId: string }
      removeBookmark?: string
      progress?: LocalProgress
      dropFollowing?: boolean
    } = {},
  ): Promise<void> {
    await inTransaction(this.db, [STORES.outbox, STORES.annotations, STORES.bookmarks, STORES.progress], 'readwrite', async (tx) => {
      const outbox = tx.objectStore(STORES.outbox)
      outbox.delete(entry.seq!)
      let remaining = ((await requestResult(outbox.getAll())) as OutboxEntry[]).filter((other) => other.seq !== entry.seq)
      if (effects.dropFollowing && 'clientId' in entry) {
        for (const other of remaining) if ('clientId' in other && other.clientId === entry.clientId) outbox.delete(other.seq!)
        remaining = remaining.filter((other) => !('clientId' in other && other.clientId === entry.clientId))
      }
      // A later local edit is still queued: take the server's identity for the record but keep the
      // user's newer content, which the queued edit will deliver.
      const stillPending = 'clientId' in entry && remaining.some((other) => 'clientId' in other && other.clientId === entry.clientId)
      if (effects.annotation) {
        const store = tx.objectStore(STORES.annotations)
        const current = (await requestResult(store.get(effects.annotation.clientId))) as LocalAnnotation | undefined
        const { id, serverId } = effects.annotation
        if (current)
          store.put(
            stillPending
              ? { ...current, ...(id === undefined ? {} : { id }), ...(serverId === undefined ? {} : { serverId }) }
              : { ...current, ...effects.annotation },
          )
      }
      if (effects.removeAnnotation) tx.objectStore(STORES.annotations).delete(effects.removeAnnotation)
      if (effects.bookmark) {
        const store = tx.objectStore(STORES.bookmarks)
        const current = (await requestResult(store.get(effects.bookmark.clientId))) as LocalBookmark | undefined
        if (current) {
          // The server keeps one bookmark per place; if another device's copy is already here, keep ours.
          const serverId = effects.bookmark.serverId
          if (serverId != null) {
            const siblings = (await requestResult(store.index('bookId').getAll(current.bookId))) as LocalBookmark[]
            for (const sibling of siblings) if (sibling.clientId !== current.clientId && sibling.serverId === serverId) store.delete(sibling.clientId)
          }
          store.put({ ...current, ...effects.bookmark })
        }
      }
      if (effects.removeBookmark) tx.objectStore(STORES.bookmarks).delete(effects.removeBookmark)
      const newerProgressQueued = entry.kind === 'progress' && remaining.some((other) => other.kind === 'progress' && other.fileId === entry.fileId)
      if (effects.progress && !newerProgressQueued)
        tx.objectStore(STORES.progress).put({ ...effects.progress, readAtSource: 'server' } satisfies LocalProgress)
    })
    const changes: ReplicaChange[] = [{ scope: 'outbox' }]
    if (effects.annotation || effects.removeAnnotation) changes.push({ scope: 'annotations', bookId: entry.bookId })
    if (effects.bookmark || effects.removeBookmark) changes.push({ scope: 'bookmarks', bookId: entry.bookId })
    if (effects.progress) changes.push({ scope: 'progress', bookId: entry.bookId })
    this.notify(...changes)
  }

  // Server state

  /**
   * Replaces one book's annotations with the server's list, except where this device still has a
   * write queued: those records stay as the user left them until the outbox has delivered them.
   */
  async applyServerAnnotations(bookId: number, items: AnnotationItem[]): Promise<void> {
    await inTransaction(this.db, [STORES.annotations, STORES.outbox], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.annotations)
      const pending = pendingClientIds(await requestResult(tx.objectStore(STORES.outbox).getAll() as IDBRequest<OutboxEntry[]>))
      const local = (await requestResult(store.index('bookId').getAll(bookId))) as LocalAnnotation[]
      const byServerId = new Map(local.filter((row) => row.serverId !== null).map((row) => [row.serverId!, row]))
      const seen = new Set<number>()
      for (const item of items) {
        seen.add(item.id)
        const existing = byServerId.get(item.id)
        if (existing && pending.has(existing.clientId)) continue
        const clientId = existing?.clientId ?? `server-${item.id}`
        store.put({ ...item, clientId, serverId: item.id, bookFileId: item.jumpFileId ?? null, deleted: false } satisfies LocalAnnotation)
      }
      for (const row of local) {
        if (row.serverId !== null && !seen.has(row.serverId) && !pending.has(row.clientId)) store.delete(row.clientId)
      }
    })
    this.notify({ scope: 'annotations', bookId })
  }

  async applyServerBookmarks(
    bookId: number,
    items: Array<{ id: number; bookId: number; cfi: string | null; title: string; createdAt: string }>,
  ): Promise<void> {
    await inTransaction(this.db, [STORES.bookmarks, STORES.outbox], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.bookmarks)
      const pending = pendingClientIds(await requestResult(tx.objectStore(STORES.outbox).getAll() as IDBRequest<OutboxEntry[]>))
      const local = (await requestResult(store.index('bookId').getAll(bookId))) as LocalBookmark[]
      const byServerId = new Map(local.filter((row) => row.serverId !== null).map((row) => [row.serverId!, row]))
      const seen = new Set<number>()
      for (const item of items) {
        if (!item.cfi) continue
        seen.add(item.id)
        const existing = byServerId.get(item.id)
        if (existing && pending.has(existing.clientId)) continue
        store.put({
          clientId: existing?.clientId ?? `server-${item.id}`,
          id: item.id,
          serverId: item.id,
          bookId,
          cfi: item.cfi,
          title: item.title,
          createdAt: item.createdAt,
          deleted: false,
        } satisfies LocalBookmark)
      }
      for (const row of local) {
        if (row.serverId !== null && !seen.has(row.serverId) && !pending.has(row.clientId)) store.delete(row.clientId)
      }
    })
    this.notify({ scope: 'bookmarks', bookId })
  }

  /**
   * Adopts the server's position unless a local one is still queued or was read more recently. A
   * position stamped by this device's clock is moved onto the server's clock first, by the skew the
   * sync engine measured, so a fast device clock cannot keep an older position in front.
   */
  async applyServerProgress(progress: LocalProgress): Promise<boolean> {
    const applied = await inTransaction(this.db, [STORES.progress, STORES.outbox, STORES.meta], 'readwrite', async (tx) => {
      const entries = (await requestResult(tx.objectStore(STORES.outbox).getAll())) as OutboxEntry[]
      if (entries.some((entry) => entry.kind === 'progress' && entry.fileId === progress.fileId)) return false
      const store = tx.objectStore(STORES.progress)
      const current = (await requestResult(store.get(progress.fileId))) as LocalProgress | undefined
      if (current) {
        const skewRow = (await requestResult(tx.objectStore(STORES.meta).get(CLOCK_SKEW_META_KEY))) as MetaRecord | undefined
        const skewMs = current.readAtSource === 'server' ? 0 : typeof skewRow?.value === 'number' ? skewRow.value : 0
        if (Date.parse(current.readAt) + skewMs > Date.parse(progress.readAt)) return false
      }
      store.put({ ...progress, readAtSource: 'server' } satisfies LocalProgress)
      return true
    })
    if (applied) this.notify({ scope: 'progress', bookId: progress.bookId })
    return applied
  }

  // Meta

  async getMeta<T>(key: string): Promise<T | undefined> {
    const row = await inTransaction(this.db, [STORES.meta], 'readonly', (tx) => requestResult(tx.objectStore(STORES.meta).get(key)))
    return (row as { value: T } | undefined)?.value
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await inTransaction(this.db, [STORES.meta], 'readwrite', (tx) => {
      tx.objectStore(STORES.meta).put({ key, value })
    })
  }
}

function append(outbox: IDBObjectStore, entry: NewOutboxEntry) {
  outbox.add({ ...entry, attempts: 0, sending: false })
}

async function unsentEntries(outbox: IDBObjectStore): Promise<OutboxEntry[]> {
  const all = (await requestResult(outbox.getAll())) as OutboxEntry[]
  return all.filter((entry) => !entry.sending)
}

function pendingClientIds(entries: OutboxEntry[]): Set<string> {
  return new Set(entries.flatMap((entry) => ('clientId' in entry ? [entry.clientId] : [])))
}
