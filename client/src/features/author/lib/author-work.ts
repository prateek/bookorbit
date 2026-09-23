import type { AuthorSummary } from '@bookorbit/types'

type AuthorWorkCounts = Pick<AuthorSummary, 'bookCount' | 'seriesCount' | 'serialBookCount'>

/**
 * An author writes serials when most of their books are chapters: books in a series inside a
 * library that counts a series as one book. Their pages then count serials and chapters, which is
 * how a serial reader thinks of them, rather than a four-digit book count.
 */
export function isSerialAuthor(author: AuthorWorkCounts): boolean {
  return (author.seriesCount ?? 0) > 0 && (author.serialBookCount ?? 0) * 2 > author.bookCount
}
