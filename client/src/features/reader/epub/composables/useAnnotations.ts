import { getCurrentScope, onScopeDispose, ref } from 'vue'
import type { AnnotationItem, AnnotationListResponse } from '@bookorbit/types'
import { api } from '@/lib/api'
import { attachBookReplica } from '@/features/offline/composables/useBookReplica'
import type { OfflineSession } from '@/features/offline/offline-session'

export type Annotation = AnnotationItem

export interface AnnotationPatch {
  note?: string | null
  color?: string
  style?: string
}

async function send(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await (init ? api(path, init) : api(path))
  } catch {
    return null
  }
}

export function useAnnotations() {
  const annotations = ref<Annotation[]>([])
  const loadError = ref<string | null>(null)
  // Set once load() finds an offline session: reads and writes then go through the local replica.
  let session: OfflineSession | null = null
  let detachReplica: (() => void) | null = null
  if (getCurrentScope()) onScopeDispose(() => detachReplica?.())

  async function load(bookId: number, readerFileId?: number) {
    loadError.value = null
    async function readReplica(current: OfflineSession): Promise<Annotation[]> {
      const local = await current.replica.listAnnotations(bookId)
      if (readerFileId == null) return local
      const projected = new Map<number, Annotation>()
      if (navigator.onLine !== false) {
        const signal = AbortSignal.timeout(1500)
        for (let page = 1; ; page += 1) {
          const response = await send(`/api/v1/books/${bookId}/annotations?page=${page}&pageSize=100&readerFileId=${readerFileId}`, { signal })
          if (!response?.ok) break
          const result = (await response.json()) as AnnotationListResponse
          for (const item of result.items) projected.set(item.id, item)
          if (projected.size >= result.total || result.items.length === 0) break
        }
      }
      return local.map((item) => {
        const position = item.serverId != null ? projected.get(item.serverId) : undefined
        return {
          ...item,
          cfi: position ? position.cfi : item.bookFileId === readerFileId ? item.cfi : null,
          jumpFileId: position?.jumpFileId ?? (item.bookFileId === readerFileId ? readerFileId : null),
          positionStatus: position?.positionStatus ?? item.positionStatus,
        }
      })
    }
    detachReplica?.()
    const attached = await attachBookReplica(bookId, 'annotations', async (current) => {
      annotations.value = await readReplica(current)
    })
    session = attached?.session ?? null
    detachReplica = attached?.detach ?? null
    if (session) {
      annotations.value = await readReplica(session)
      return
    }
    if (readerFileId != null) {
      const loaded: Annotation[] = []
      for (let page = 1; ; page += 1) {
        const res = await send(`/api/v1/books/${bookId}/annotations?page=${page}&pageSize=100&readerFileId=${readerFileId}`)
        if (!res?.ok) {
          loadError.value = 'Failed to load'
          return
        }
        const result: AnnotationListResponse = await res.json()
        loaded.push(...result.items)
        if (loaded.length >= result.total || result.items.length === 0) break
      }
      annotations.value = loaded
      return
    }
    const res = await send(`/api/v1/books/${bookId}/annotations`)
    if (!res?.ok) {
      loadError.value = 'Failed to load'
      return
    }
    annotations.value = await res.json()
  }

  async function create(
    bookId: number,
    data: { cfi: string; bookFileId?: number; text: string; color: string; style: string; note?: string | null; chapterTitle?: string | null },
  ): Promise<Annotation | null> {
    if (session) {
      const created = await session.replica.createAnnotation(bookId, data).catch(() => null)
      if (created) annotations.value = [...annotations.value.filter((a) => a.id !== created.id), created]
      return created
    }
    const res = await send(`/api/v1/books/${bookId}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res?.ok) return null
    const created: Annotation = await res.json()
    annotations.value = [...annotations.value, created]
    return created
  }

  async function update(bookId: number, id: number, data: AnnotationPatch): Promise<Annotation | null> {
    if (session) {
      const updated = await session.replica.updateAnnotation(bookId, id, data).catch(() => null)
      if (updated) annotations.value = annotations.value.map((a) => (a.id === id ? updated : a))
      return updated
    }
    const res = await send(`/api/v1/books/${bookId}/annotations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res?.ok) return null

    const canonical: Annotation = await res.json()
    const existing = annotations.value.find((annotation) => annotation.id === id)
    const updated: Annotation = existing
      ? {
          ...canonical,
          cfi: existing.cfi,
          jumpFileId: existing.jumpFileId,
          positionStatus: existing.positionStatus,
          chapterIndex: existing.chapterIndex,
        }
      : canonical
    annotations.value = annotations.value.map((a) => (a.id === id ? updated : a))
    return updated
  }

  function updateNote(bookId: number, id: number, note: string | null): Promise<Annotation | null> {
    return update(bookId, id, { note })
  }

  async function remove(bookId: number, id: number): Promise<boolean> {
    if (session) {
      if (!(await session.replica.deleteAnnotation(bookId, id).catch(() => false))) return false
      annotations.value = annotations.value.filter((a) => a.id !== id)
      return true
    }
    const res = await send(`/api/v1/books/${bookId}/annotations/${id}`, {
      method: 'DELETE',
    })
    if (!res?.ok) return false
    annotations.value = annotations.value.filter((a) => a.id !== id)
    return true
  }

  return { annotations, loadError, load, create, update, updateNote, remove }
}
