import type { AnnotationItem } from '@bookorbit/types'
import { api, isServerUnreachable, ServerUnavailableError } from '@/lib/api'
import type { LocalAnnotation, LocalProgress, OutboxEntry } from './offline-db'
import { CLOCK_SKEW_META_KEY, type ReaderReplica } from './replica'

export type PushOutcome = 'drained' | 'offline' | 'unauthenticated' | 'server-error' | 'budget'

export interface SyncFailure {
  at: string
  kind: OutboxEntry['kind']
  bookId: number
  status: number
  message: string
}

type Request = (input: string, init?: RequestInit) => Promise<Response>

const FAILURE_LOG_KEY = 'failures'
const FAILURE_LOG_LIMIT = 50
/** A position captured this recently is sent as the web reader always has, without the pre-check. */
const FRESH_PROGRESS_MS = 60_000

class RetryLater extends Error {
  constructor(readonly outcome: Exclude<PushOutcome, 'drained' | 'budget'>) {
    super(outcome)
  }
}

class Rejected extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Replays the outbox against the REST endpoints every BookOrbit client already uses, so the fork
 * needs no sync API of its own. Entries go out one at a time in the order they were made. A
 * network failure leaves the entry queued; a request the server refuses for good (the book is gone,
 * the payload is invalid) is dropped and logged, because retrying it could only block the queue.
 *
 * The endpoints are not idempotent by themselves, so the engine makes each write safe to repeat:
 * a progress write first checks that no other device has read the file since, and an annotation
 * create whose earlier attempt may have landed looks for it before posting again. Bookmark creates
 * are idempotent by location and sessions by `sessionId` on the server.
 */
export class SyncEngine {
  private clockSkewMs = 0

  constructor(
    private readonly replica: ReaderReplica,
    private readonly request: Request = api,
  ) {}

  async push(budget = 200): Promise<PushOutcome> {
    this.clockSkewMs = (await this.replica.getMeta<number>(CLOCK_SKEW_META_KEY)) ?? 0
    let sent = 0
    while (sent < budget) {
      const [next] = await this.replica.listOutbox(1)
      if (!next) return 'drained'
      const entry = await this.replica.markSending(next.seq!)
      if (!entry) continue
      sent += 1
      try {
        await this.deliver(entry)
      } catch (error) {
        if (error instanceof Rejected) {
          await this.replica.completeEntry(entry, this.rejectionEffects(entry))
          await this.logFailure(entry, error.status, error.message)
          continue
        }
        const outcome = error instanceof RetryLater ? error.outcome : isServerUnreachable(error) ? 'offline' : 'server-error'
        if (error instanceof Error && error.message === 'Session expired') {
          await this.replica.releaseEntry(entry.seq!, 'session expired')
          return 'unauthenticated'
        }
        await this.replica.releaseEntry(entry.seq!, error instanceof Error ? error.message : String(error))
        return outcome
      }
    }
    return 'budget'
  }

  /** Pulls one book's annotations, bookmarks and the given files' progress into the replica. */
  async refreshBook(bookId: number, fileIds: number[]): Promise<void> {
    const annotations = await this.getJson<AnnotationItem[]>(`/api/v1/books/${bookId}/annotations`)
    if (annotations) await this.replica.applyServerAnnotations(bookId, annotations)
    const bookmarks = await this.getJson<Array<{ id: number; bookId: number; cfi: string | null; title: string; createdAt: string }>>(
      `/api/v1/books/${bookId}/bookmarks`,
    )
    if (bookmarks) await this.replica.applyServerBookmarks(bookId, bookmarks)
    for (const fileId of fileIds) {
      const progress = await this.getJson<ServerProgress>(`/api/v1/books/files/${fileId}/progress`)
      const local = progress ? toLocalProgress(fileId, bookId, progress) : null
      if (local) await this.replica.applyServerProgress(local)
    }
  }

  private async deliver(entry: OutboxEntry): Promise<void> {
    switch (entry.kind) {
      case 'progress':
        return this.deliverProgress(entry)
      case 'session': {
        await this.send(`/api/v1/books/files/${entry.fileId}/sessions`, 'POST', entry.body)
        return this.replica.completeEntry(entry)
      }
      case 'annotation.create':
        return this.deliverAnnotationCreate(entry)
      case 'annotation.update': {
        const serverId = await this.annotationServerId(entry.bookId, entry.clientId)
        if (serverId === null) return this.replica.completeEntry(entry)
        const response = await this.send(`/api/v1/books/${entry.bookId}/annotations/${serverId}`, 'PATCH', entry.patch, { goneOn404: true })
        if (!response) return this.replica.completeEntry(entry, { removeAnnotation: entry.clientId, dropFollowing: true })
        const item = (await response.json()) as AnnotationItem
        return this.replica.completeEntry(entry, { annotation: fromServerAnnotation(entry.clientId, item) })
      }
      case 'annotation.delete': {
        const serverId = await this.annotationServerId(entry.bookId, entry.clientId)
        if (serverId !== null) await this.send(`/api/v1/books/${entry.bookId}/annotations/${serverId}`, 'DELETE', undefined, { goneOn404: true })
        return this.replica.completeEntry(entry, { removeAnnotation: entry.clientId })
      }
      case 'bookmark.create': {
        const response = await this.send(`/api/v1/books/${entry.bookId}/bookmarks`, 'POST', { cfi: entry.cfi, title: entry.title })
        const created = (await response!.json()) as { id: number }
        return this.replica.completeEntry(entry, { bookmark: { clientId: entry.clientId, id: created.id, serverId: created.id } })
      }
      case 'bookmark.delete': {
        const bookmarks = await this.replica.listBookmarksIncludingDeleted(entry.bookId)
        const serverId = bookmarks.find((row) => row.clientId === entry.clientId)?.serverId ?? null
        if (serverId !== null) await this.send(`/api/v1/books/${entry.bookId}/bookmarks/${serverId}`, 'DELETE', undefined, { goneOn404: true })
        return this.replica.completeEntry(entry, { removeBookmark: entry.clientId })
      }
    }
  }

  /**
   * The progress endpoint keeps whatever arrives last, so a position read offline yesterday would
   * overwrite one another device read this morning. Checking the server's `lastReadAt` first, with
   * this device's clock corrected by the skew the server's Date header reveals, keeps the later
   * reading. The check and the write are separate requests; a write landing between them is the
   * one case this cannot see.
   */
  private async deliverProgress(entry: Extract<OutboxEntry, { kind: 'progress' }>): Promise<void> {
    const capturedAt = Date.parse(entry.capturedAt) + this.clockSkewMs
    if (Date.now() + this.clockSkewMs - capturedAt > FRESH_PROGRESS_MS) {
      const response = await this.send(`/api/v1/books/files/${entry.fileId}/progress`, 'GET', undefined, { goneOn404: true })
      if (!response) return this.replica.completeEntry(entry)
      const server = (await response.json()) as ServerProgress
      const serverReadAt = server.lastReadAt ? Date.parse(server.lastReadAt) : null
      if (serverReadAt !== null && serverReadAt > capturedAt) {
        const adopted = toLocalProgress(entry.fileId, entry.bookId, server)
        return this.replica.completeEntry(entry, adopted ? { progress: adopted } : {})
      }
    }
    await this.send(`/api/v1/books/files/${entry.fileId}/progress`, 'POST', entry.body)
    return this.replica.completeEntry(entry)
  }

  /**
   * An earlier attempt may have created the annotation even though no response came back, and
   * the endpoint has no idempotency key, so before posting again the engine looks for an
   * annotation at the same place with the same text that no local record already claims.
   */
  private async deliverAnnotationCreate(entry: Extract<OutboxEntry, { kind: 'annotation.create' }>): Promise<void> {
    if (entry.attempts > 1) {
      const existing = await this.getJson<AnnotationItem[]>(`/api/v1/books/${entry.bookId}/annotations`)
      const claimed = new Set(
        (await this.replica.listAnnotationsIncludingDeleted(entry.bookId)).flatMap((row) => (row.serverId === null ? [] : [row.serverId])),
      )
      const match = existing?.find((item) => !claimed.has(item.id) && sameAnnotationPlace(item, entry.body))
      if (match) return this.replica.completeEntry(entry, { annotation: fromServerAnnotation(entry.clientId, match) })
    }
    const response = await this.send(`/api/v1/books/${entry.bookId}/annotations`, 'POST', entry.body)
    const item = (await response!.json()) as AnnotationItem
    return this.replica.completeEntry(entry, { annotation: fromServerAnnotation(entry.clientId, item) })
  }

  private async annotationServerId(bookId: number, clientId: string): Promise<number | null> {
    const rows = await this.replica.listAnnotationsIncludingDeleted(bookId)
    return rows.find((row) => row.clientId === clientId)?.serverId ?? null
  }

  /** Resolves null for a 404 when `goneOn404` is set; throws `Rejected` for other client errors. */
  private async send(path: string, method: string, body?: unknown, options: { goneOn404?: boolean } = {}): Promise<Response | null> {
    const response = await this.request(path, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    await this.observeClock(response)
    if (response.ok) return response
    if (response.status === 404 && options.goneOn404) return null
    if (response.status >= 500) throw new RetryLater(response.status >= 502 && response.status <= 504 ? 'offline' : 'server-error')
    if (response.status === 408 || response.status === 429) throw new RetryLater('server-error')
    const message = await response
      .json()
      .then((data: { message?: unknown }) => (typeof data.message === 'string' ? data.message : response.statusText))
      .catch(() => response.statusText)
    throw new Rejected(response.status, message)
  }

  private async getJson<T>(path: string): Promise<T | null> {
    const response = await this.request(path)
    await this.observeClock(response)
    if (response.status === 404 || response.status === 403) return null
    if (response.status >= 502 && response.status <= 504) throw new ServerUnavailableError(response.status)
    if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`)
    return (await response.json()) as T
  }

  private async observeClock(response: Response) {
    const header = response.headers.get('date')
    const serverNow = header ? Date.parse(header) : NaN
    if (Number.isNaN(serverNow)) return
    // The header has one-second resolution; ignore drift inside that so the estimate does not jitter.
    const skew = serverNow - Date.now()
    if (Math.abs(skew - this.clockSkewMs) < 2_000) return
    this.clockSkewMs = skew
    await this.replica.setMeta(CLOCK_SKEW_META_KEY, skew)
  }

  private rejectionEffects(entry: OutboxEntry) {
    if (entry.kind === 'annotation.create') return { removeAnnotation: entry.clientId, dropFollowing: true }
    if (entry.kind === 'bookmark.create') return { removeBookmark: entry.clientId, dropFollowing: true }
    return {}
  }

  private async logFailure(entry: OutboxEntry, status: number, message: string) {
    const log = (await this.replica.getMeta<SyncFailure[]>(FAILURE_LOG_KEY)) ?? []
    log.unshift({ at: new Date().toISOString(), kind: entry.kind, bookId: entry.bookId, status, message })
    await this.replica.setMeta(FAILURE_LOG_KEY, log.slice(0, FAILURE_LOG_LIMIT))
  }
}

export async function readFailureLog(replica: ReaderReplica): Promise<SyncFailure[]> {
  return (await replica.getMeta<SyncFailure[]>(FAILURE_LOG_KEY)) ?? []
}

interface ServerProgress {
  percentage?: number
  cfi?: string | null
  pageNumber?: number | null
  positionSeconds?: number | null
  mediaOverlayFragment?: string | null
  mediaOverlaySectionIndex?: number | null
  koboLocationSource?: string | null
  koboLocationType?: string | null
  koboLocationValue?: string | null
  koboContentSourceProgressPercent?: number | null
  koreaderProgress?: string | null
  lastReadAt?: string | null
}

/** Null when the server has no row for the file: nobody has read it anywhere yet. */
function toLocalProgress(fileId: number, bookId: number, server: ServerProgress): LocalProgress | null {
  if (!server.lastReadAt) return null
  return {
    fileId,
    bookId,
    percentage: server.percentage ?? 0,
    cfi: server.cfi ?? null,
    pageNumber: server.pageNumber ?? null,
    positionSeconds: server.positionSeconds ?? null,
    mediaOverlayFragment: server.mediaOverlayFragment ?? null,
    mediaOverlaySectionIndex: server.mediaOverlaySectionIndex ?? null,
    koboLocationSource: server.koboLocationSource ?? null,
    koboLocationType: server.koboLocationType ?? null,
    koboLocationValue: server.koboLocationValue ?? null,
    koboContentSourceProgressPercent: server.koboContentSourceProgressPercent ?? null,
    koreaderProgress: server.koreaderProgress ?? null,
    source: 'text',
    readAt: new Date(server.lastReadAt).toISOString(),
  }
}

function fromServerAnnotation(clientId: string, item: AnnotationItem): Partial<LocalAnnotation> & { clientId: string } {
  return { ...item, clientId, id: item.id, serverId: item.id }
}

function sameAnnotationPlace(item: AnnotationItem, body: { cfi?: string; pdf?: { page: number; rect: unknown }; text: string }): boolean {
  if (item.text !== body.text) return false
  if (body.cfi) return item.cfi === body.cfi
  if (body.pdf && item.pdf) return item.pdf.page === body.pdf.page && JSON.stringify(item.pdf.rect) === JSON.stringify(body.pdf.rect)
  return false
}
