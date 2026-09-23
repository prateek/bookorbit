export function seriesCoverSeed(seriesName: string): string {
  return `series:${seriesName.trim().toLocaleLowerCase()}`
}

/** Chapters of one series share a generated cover color, so the seed prefers the series name over the title. */
export function bookCoverSeed(book: { id: number; title?: string | null; seriesName?: string | null }): string {
  const seriesName = book.seriesName?.trim()
  if (seriesName) return seriesCoverSeed(seriesName)
  return book.title ?? String(book.id)
}
