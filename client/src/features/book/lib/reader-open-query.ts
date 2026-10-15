import type { ReadStatus } from '@bookorbit/types'

/**
 * The reader opens a finished book as a peek unless asked for a reread, so the book page's "Read
 * again" has to ask for one.
 */
export function readerOpenQuery(format: string | null | undefined, readStatus: ReadStatus | null | undefined, mode?: 'peek') {
  const query: { format: string; mode?: 'peek' | 'reread' } = { format: format ?? 'epub' }
  if (mode === 'peek') query.mode = 'peek'
  else if (readStatus === 'read') query.mode = 'reread'
  return query
}
