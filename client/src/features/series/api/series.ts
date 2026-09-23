import { api } from '@/lib/api'
import type { SeriesBooksPage, SeriesFollowResponse, SeriesIndex, SeriesMarkReadResponse, SeriesPage } from '@bookorbit/types'
import type { CompletionStatus, SeriesBookSort, SeriesListSort, SortDirection } from '../types/series'

type ListSeriesParams = {
  q?: string
  page: number
  size: number
  sort: SeriesListSort | 'relevance'
  order: SortDirection
  libraryId?: number | null
  completionStatus?: CompletionStatus | null
  author?: string | null
}

type ListSeriesBooksParams = {
  page: number
  size: number
  sort: SeriesBookSort
  order: SortDirection
  libraryId?: number | null
  readState?: 'unread' | null
  /** Opens the listing on the page holding this book; series order only. */
  anchorBookId?: number | null
}

function toQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '')
  return new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

export async function fetchSeries(params: ListSeriesParams, signal?: AbortSignal): Promise<SeriesPage> {
  const qs = toQuery(params)
  const res = await api(`/api/v1/series?${qs}`, signal ? { signal } : undefined)
  if (!res.ok) throw new Error(`Failed to fetch series: ${res.status}`)
  return res.json()
}

export async function fetchSeriesBooks(seriesId: number, params: ListSeriesBooksParams): Promise<SeriesBooksPage> {
  const qs = toQuery(params)
  const res = await api(`/api/v1/series/${seriesId}/books?${qs}`)
  if (!res.ok) throw new Error(`Failed to fetch series books: ${res.status}`)
  return res.json()
}

type MarkSeriesReadParams = {
  /** Marks every book numbered at or below this index; omitted marks the whole series. */
  upToIndex?: SeriesIndex | null
  libraryId?: number | null
}

/**
 * Marks a series, or its books up to a number, as read in one request. The server resolves the
 * books by this series' own numbering, so a serial of thousands of chapters is one call.
 */
export async function markSeriesRead(seriesId: number, params: MarkSeriesReadParams = {}): Promise<SeriesMarkReadResponse> {
  const body: { upToIndex?: SeriesIndex; libraryId?: number } = {}
  if (params.upToIndex != null) body.upToIndex = params.upToIndex
  if (params.libraryId != null) body.libraryId = params.libraryId

  const res = await api(`/api/v1/series/${seriesId}/mark-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Failed to mark series read: ${res.status}`)
  return res.json()
}

/** Follows or unfollows a series for the signed-in user. Unfollowed series stay off shelves and new-chapter pushes. */
export async function setSeriesFollowing(seriesId: number, following: boolean): Promise<SeriesFollowResponse> {
  const res = await api(`/api/v1/series/${seriesId}/follow`, { method: following ? 'PUT' : 'DELETE' })
  if (!res.ok) throw new Error(`Failed to update series follow state: ${res.status}`)
  return res.json()
}
