import type { AnnotationItem } from '@bookorbit/types'
import { NetworkError } from '@/lib/api'

interface ServerBookmark {
  id: number
  bookId: number
  cfi: string
  title: string
  createdAt: string
  deleted: boolean
}

interface ServerProgressRow {
  percentage: number
  cfi: string | null
  pageNumber: number | null
  lastReadAt: string
}

/**
 * The slice of BookOrbit's REST API the offline engine talks to, with the server's real semantics:
 * progress keeps the last write to arrive, annotations get serial ids and 404 once deleted,
 * bookmarks are one per place, and sessions are idempotent by `sessionId`.
 */
export class FakeBookOrbitServer {
  online = true
  /** Applies the next matching request, then fails as if the response never arrived. */
  dropResponseFor: RegExp | null = null
  now = Date.parse('2026-09-24T12:00:00.000Z')
  readonly annotations = new Map<number, AnnotationItem & { deleted: boolean; bookFileId: number | null }>()
  readonly bookmarks = new Map<number, ServerBookmark>()
  readonly progress = new Map<number, ServerProgressRow>()
  readonly sessions = new Map<string, unknown>()
  readonly requests: string[] = []
  readonly fileBooks = new Map<number, number>()
  rejectBooks = new Set<number>()
  private nextId = 1

  tick(ms = 1000) {
    this.now += ms
  }

  /** A client bound to this server, with its own device clock offset. */
  client(clockOffsetMs = 0) {
    return (input: string, init: RequestInit = {}) => this.handle(input, init, clockOffsetMs)
  }

  liveAnnotations(bookId: number) {
    return [...this.annotations.values()].filter((row) => row.bookId === bookId && !row.deleted)
  }

  liveBookmarks(bookId: number) {
    return [...this.bookmarks.values()].filter((row) => row.bookId === bookId && !row.deleted)
  }

  private async handle(input: string, init: RequestInit, _clockOffsetMs: number): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase()
    this.requests.push(`${method} ${input}`)
    if (!this.online) throw new NetworkError('Failed to fetch')
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    const response = this.route(method, input, body)
    this.tick(10)
    if (this.dropResponseFor?.test(`${method} ${input}`)) {
      this.dropResponseFor = null
      throw new NetworkError('The network connection was lost.')
    }
    return response
  }

  private json(status: number, data?: unknown): Response {
    return new Response(data === undefined ? null : JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json', date: new Date(this.now).toUTCString() },
    })
  }

  private route(method: string, path: string, body: Record<string, unknown> | undefined): Response {
    let match = /^\/api\/v1\/books\/files\/(\d+)\/progress$/.exec(path)
    if (match) {
      const fileId = Number(match[1])
      if (method === 'GET') return this.json(200, this.progress.get(fileId) ?? { percentage: 0, cfi: null })
      this.progress.set(fileId, {
        percentage: body!.percentage as number,
        cfi: (body!.cfi as string | null) ?? null,
        pageNumber: (body!.pageNumber as number | null) ?? null,
        lastReadAt: new Date(this.now).toISOString(),
      })
      return this.json(201)
    }
    match = /^\/api\/v1\/books\/files\/(\d+)\/sessions$/.exec(path)
    if (match) {
      const sessionId = body!.sessionId as string
      if (!this.sessions.has(sessionId)) this.sessions.set(sessionId, body)
      return this.json(201)
    }
    match = /^\/api\/v1\/books\/(\d+)\/annotations(?:\/(\d+))?$/.exec(path)
    if (match) {
      const bookId = Number(match[1])
      if (this.rejectBooks.has(bookId)) return this.json(404, { message: `Book ${bookId} not found` })
      const id = match[2] ? Number(match[2]) : null
      if (method === 'GET')
        return this.json(
          200,
          this.liveAnnotations(bookId).map(({ deleted: _deleted, bookFileId: _file, ...item }) => item),
        )
      if (method === 'POST') {
        const at = new Date(this.now).toISOString()
        const row = {
          id: this.nextId++,
          bookId,
          cfi: (body!.cfi as string) ?? null,
          jumpFileId: (body!.bookFileId as number) ?? null,
          bookFileId: (body!.bookFileId as number) ?? null,
          pageno: null,
          text: body!.text as string,
          color: body!.color as string,
          style: body!.style as string,
          note: (body!.note as string | null) ?? null,
          chapterTitle: (body!.chapterTitle as string | null) ?? null,
          origin: 'web' as const,
          positionStatus: 'exact' as const,
          chapterIndex: null,
          highlightedAt: at,
          createdAt: at,
          updatedAt: at,
          pdf: null,
          deleted: false,
        }
        this.annotations.set(row.id, row)
        const { deleted: _deleted, bookFileId: _file, ...item } = row
        return this.json(201, item)
      }
      const row = id === null ? undefined : this.annotations.get(id)
      if (!row || row.deleted || row.bookId !== bookId) return this.json(404, { message: 'Annotation not found' })
      if (method === 'PATCH') {
        Object.assign(row, body, { updatedAt: new Date(this.now).toISOString() })
        const { deleted: _deleted, bookFileId: _file, ...item } = row
        return this.json(200, item)
      }
      row.deleted = true
      return this.json(204)
    }
    match = /^\/api\/v1\/books\/(\d+)\/bookmarks(?:\/(\d+))?$/.exec(path)
    if (match) {
      const bookId = Number(match[1])
      const id = match[2] ? Number(match[2]) : null
      if (method === 'GET')
        return this.json(
          200,
          this.liveBookmarks(bookId).map(({ deleted: _deleted, ...row }) => row),
        )
      if (method === 'POST') {
        const cfi = body!.cfi as string
        const existing = [...this.bookmarks.values()].find((row) => row.bookId === bookId && row.cfi === cfi)
        if (existing) {
          existing.deleted = false
          const { deleted: _deleted, ...row } = existing
          return this.json(201, row)
        }
        const row = { id: this.nextId++, bookId, cfi, title: body!.title as string, createdAt: new Date(this.now).toISOString(), deleted: false }
        this.bookmarks.set(row.id, row)
        const { deleted: _deleted, ...item } = row
        return this.json(201, item)
      }
      const row = id === null ? undefined : this.bookmarks.get(id)
      if (!row || row.deleted) return this.json(404, { message: 'Bookmark not found' })
      row.deleted = true
      return this.json(204)
    }
    return this.json(404, { message: `No route ${method} ${path}` })
  }
}
