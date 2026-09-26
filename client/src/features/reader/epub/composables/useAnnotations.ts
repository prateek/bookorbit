import { getCurrentScope, onScopeDispose, ref } from 'vue'
import type { AnnotationItem } from '@bookorbit/types'
import { api } from '@/lib/api'
import { attachBookReplica } from '@/features/offline/composables/useBookReplica'
import type { OfflineSession } from '@/features/offline/offline-session'

export type Annotation = AnnotationItem

export interface AnnotationPatch {
  note?: string | null
  color?: string
  style?: string
}

export function useAnnotations() {
  const annotations = ref<Annotation[]>([])
  const loadError = ref<string | null>(null)
  // Set once load() finds an offline session: reads and writes then go through the local replica.
  let session: OfflineSession | null = null
  let detachReplica: (() => void) | null = null
  if (getCurrentScope()) onScopeDispose(() => detachReplica?.())

  async function load(bookId: number) {
    loadError.value = null
    detachReplica?.()
    const attached = await attachBookReplica(bookId, 'annotations', async (current) => {
      annotations.value = await current.replica.listAnnotations(bookId)
    })
    session = attached?.session ?? null
    detachReplica = attached?.detach ?? null
    if (session) {
      annotations.value = await session.replica.listAnnotations(bookId)
      return
    }
    const res = await api(`/api/v1/books/${bookId}/annotations`)
    if (!res.ok) {
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
    const res = await api(`/api/v1/books/${bookId}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) return null
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
    const res = await api(`/api/v1/books/${bookId}/annotations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) return null

    const updated: Annotation = await res.json()
    annotations.value = annotations.value.map((a) => (a.id === id ? updated : a))
    return updated
  }

  function updateNote(bookId: number, id: number, note: string | null): Promise<Annotation | null> {
    return update(bookId, id, { note })
  }

  async function remove(bookId: number, id: number) {
    if (session) {
      if (await session.replica.deleteAnnotation(bookId, id).catch(() => false)) annotations.value = annotations.value.filter((a) => a.id !== id)
      return
    }
    const res = await api(`/api/v1/books/${bookId}/annotations/${id}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      annotations.value = annotations.value.filter((a) => a.id !== id)
    }
  }

  return { annotations, loadError, load, create, update, updateNote, remove }
}
