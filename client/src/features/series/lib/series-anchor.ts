import type { LocationQuery } from 'vue-router'

/** The chapter a series link asks to open on (`?book=<id>`), as the reader's back action sets it. */
export function seriesAnchorBookId(query: LocationQuery): number | null {
  const raw = query.book
  const value = typeof raw === 'string' ? Number(raw) : NaN
  return Number.isInteger(value) && value > 0 ? value : null
}
