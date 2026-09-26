import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import { api } from '@/lib/api'
import { attachBookReplica } from '@/features/offline/composables/useBookReplica'
import type { OfflineSession } from '@/features/offline/offline-session'

export interface Bookmark {
  id: number
  bookId: number
  cfi: string
  title: string
  createdAt: string
}

export function useBookmarks() {
  const bookmarks = ref<Bookmark[]>([])
  const currentCfi = ref<string | null>(null)
  const loadError = ref<string | null>(null)
  // Set once load() finds an offline session: reads and writes then go through the local replica.
  let session: OfflineSession | null = null
  let detachReplica: (() => void) | null = null
  if (getCurrentScope()) onScopeDispose(() => detachReplica?.())

  const isCurrentCfiBookmarked = computed(() => {
    if (!currentCfi.value) return false
    return bookmarks.value.some((b) => b.cfi === currentCfi.value)
  })

  function setCfi(cfi: string | null) {
    currentCfi.value = cfi
  }

  async function load(bookId: number) {
    loadError.value = null
    detachReplica?.()
    const attached = await attachBookReplica(bookId, 'bookmarks', async (current) => {
      bookmarks.value = await current.replica.listBookmarks(bookId)
    })
    session = attached?.session ?? null
    detachReplica = attached?.detach ?? null
    if (session) {
      bookmarks.value = await session.replica.listBookmarks(bookId)
      return
    }
    const res = await api(`/api/v1/books/${bookId}/bookmarks`)
    if (!res.ok) {
      loadError.value = 'Failed to load'
      return
    }
    bookmarks.value = await res.json()
  }

  async function toggle(bookId: number, cfi: string, title: string) {
    const existing = bookmarks.value.find((b) => b.cfi === cfi)
    if (existing) {
      await remove(bookId, existing.id)
    } else if (session) {
      const created = await session.replica.createBookmark(bookId, cfi, title).catch(() => null)
      if (created) bookmarks.value = [...bookmarks.value, created]
    } else {
      const res = await api(`/api/v1/books/${bookId}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cfi, title }),
      })
      if (res.ok) {
        const created: Bookmark = await res.json()
        bookmarks.value = [...bookmarks.value, created]
      }
    }
  }

  async function remove(bookId: number, bookmarkId: number) {
    if (session) {
      if (await session.replica.deleteBookmark(bookId, bookmarkId).catch(() => false))
        bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmarkId)
      return
    }
    const res = await api(`/api/v1/books/${bookId}/bookmarks/${bookmarkId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmarkId)
    }
  }

  return {
    bookmarks,
    isCurrentCfiBookmarked,
    currentCfi,
    loadError,
    setCfi,
    load,
    toggle,
    remove,
  }
}
