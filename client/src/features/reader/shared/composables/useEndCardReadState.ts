import { readonly, ref } from 'vue'
import type { BookDetail, ReadStatus } from '@bookorbit/types'
import { api } from '@/lib/api'
import { useBookStatus } from '@/features/book/composables/useBookStatus'

export interface FinishChapterSteps {
  /** Writes the chapter's position as 100%. */
  saveEndPosition: () => Promise<unknown>
  endSession: () => void
  isRead: () => boolean
  /** A peek tracks nothing, so finishing it leaves the read status alone. Defaults to true. */
  canMarkRead?: () => boolean
  markRead: () => Promise<unknown>
}

export interface NextChapterHandoffSteps extends FinishChapterSteps {
  open: () => Promise<unknown>
  onMarkFailed: (reason: unknown) => void
}

/**
 * The server turns a finished book back into a reread when a reading session below its finish
 * threshold arrives after the book was marked read, and queued saves can reach it in any order. The
 * last page can sit at 99.99% against a threshold of 100, so the chapter's position and its reading
 * session are both closed at 100% before the mark: every write then agrees the chapter is finished,
 * whichever lands last. Rejects when the mark fails.
 */
export async function finishChapter(steps: FinishChapterSteps): Promise<void> {
  await closeChapter(steps)
  if (shouldMark(steps)) await steps.markRead()
}

function shouldMark(steps: FinishChapterSteps): boolean {
  return (steps.canMarkRead?.() ?? true) && !steps.isRead()
}

async function closeChapter(steps: FinishChapterSteps): Promise<void> {
  await steps.saveEndPosition()
  steps.endSession()
}

/**
 * The next chapter opens without waiting for the mark: on a connection that never answers, the
 * request has no deadline and the reader would sit on the last page. A failed mark is reported
 * whenever it fails.
 */
export async function handOffToNextChapter(steps: NextChapterHandoffSteps): Promise<void> {
  await closeChapter(steps)
  if (shouldMark(steps)) void steps.markRead().catch(steps.onMarkFailed)
  await steps.open()
}

/**
 * The end card's "read" state. It starts from the book's status when the reader opens and is checked
 * again each time the card is asked for, since a saved position can mark the book read on the server
 * while the reader stays open.
 */
export function useEndCardReadState(bookId: number) {
  const { setStatus } = useBookStatus()
  const markedRead = ref(false)
  // A check that started before the latest known change must not overwrite it.
  let version = 0

  function sync(status: ReadStatus | null | undefined) {
    version++
    markedRead.value = status === 'read'
  }

  /** Keeps the current state when the server cannot be asked. */
  async function refresh() {
    const started = ++version
    try {
      const response = await api(`/api/v1/books/${bookId}`)
      if (!response.ok) return
      const book = (await response.json()) as BookDetail
      if (started === version) markedRead.value = book.readStatus?.status === 'read'
    } catch {
      // Offline or unreachable: what the card already shows is the best answer available.
    }
  }

  /** Throws when the server refuses or cannot be reached. */
  async function markRead() {
    if (markedRead.value) return
    const status = await setStatus(bookId, 'read')
    sync(status.status)
  }

  return { markedRead: readonly(markedRead), sync, refresh, markRead }
}
