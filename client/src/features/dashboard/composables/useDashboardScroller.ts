import { onMounted, ref } from 'vue'

import {
  DASHBOARD_SCROLLER_BATCH_MAX,
  type BookCard,
  type BookScrollerType,
  type DashboardScrollerBatchRequest,
  type DashboardScrollerBatchResponse,
  type DashboardScrollerBatchResult,
} from '@bookorbit/types'
import { api } from '@/lib/api'
import { onAppResumed } from '@/components/sidebar/useAppResume'
import { useBookProgressRefresh } from '@/features/book/composables/useBookProgressRefresh'

type PendingScrollerRequest = {
  item: DashboardScrollerBatchRequest['items'][number]
  resolve: (result: DashboardScrollerBatchResult) => void
  reject: (reason?: unknown) => void
}

const pendingRequests: PendingScrollerRequest[] = []
let batchScheduled = false
let requestSequence = 0

function scheduleBatch(): void {
  if (batchScheduled) return
  batchScheduled = true
  queueMicrotask(() => void flushBatch())
}

async function flushBatch(): Promise<void> {
  batchScheduled = false
  const batch = pendingRequests.splice(0, DASHBOARD_SCROLLER_BATCH_MAX)
  if (batch.length === 0) return
  if (pendingRequests.length > 0) scheduleBatch()

  try {
    const body: DashboardScrollerBatchRequest = { items: batch.map((request) => request.item) }
    const response = await api('/api/v1/dashboard/scrollers/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error('Dashboard scroller batch failed')

    const payload: DashboardScrollerBatchResponse = await response.json()
    const resultsById = new Map(payload.items.map((item) => [item.id, item]))
    for (const request of batch) {
      const result = resultsById.get(request.item.id)
      if (result) request.resolve(result)
      else request.reject(new Error('Dashboard scroller batch result missing'))
    }
  } catch (error) {
    for (const request of batch) request.reject(error)
  }
}

function requestScroller(type: BookScrollerType, limit: number, smartScopeId?: number): Promise<DashboardScrollerBatchResult> {
  return new Promise((resolve, reject) => {
    requestSequence += 1
    pendingRequests.push({
      item: {
        id: String(requestSequence),
        type,
        limit,
        ...(type === 'smart-scope' && smartScopeId ? { smartScopeId } : {}),
      },
      resolve,
      reject,
    })
    scheduleBatch()
  })
}

export function useDashboardScroller(type: BookScrollerType, limit = 20, smartScopeId?: number) {
  const books = ref<BookCard[]>([])
  const loading = ref(true)
  const error = ref(false)

  let requestToken = 0

  async function load() {
    const token = ++requestToken
    loading.value = true
    error.value = false
    try {
      const result = await requestScroller(type, limit, smartScopeId)
      if (token !== requestToken) return
      books.value = result.books
      error.value = result.failed
    } catch {
      if (token === requestToken) error.value = true
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  /** Swaps in fresh books without the skeleton, keeping the current shelf if the request fails. */
  async function reloadInPlace() {
    if (loading.value) return
    if (error.value) return load()
    const token = ++requestToken
    try {
      const result = await requestScroller(type, limit, smartScopeId)
      if (token === requestToken && !result.failed) books.value = result.books
    } catch {
      // The shelf on screen is still usable.
    }
  }

  useBookProgressRefresh(load)
  onAppResumed(reloadInPlace)
  onMounted(load)
  return { books, loading, error, refresh: load }
}
