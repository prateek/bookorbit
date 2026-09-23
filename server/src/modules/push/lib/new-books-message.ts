export interface NewBookGroup {
  seriesId: number | null;
  seriesName: string | null;
  count: number;
  sampleBookId: number;
}

export interface NewBookLaunchTarget {
  bookId: number;
  title: string | null;
  primaryFileId: number | null;
  format: string | null;
}

export interface NewBooksMessage {
  title: string;
  body: string;
  url: string;
}

const MAX_SERIES_IN_BODY = 4;
const READER_FORMATS: ReadonlySet<string> = new Set(['epub', 'pdf', 'cbz', 'cbr', 'cb7']);

/** Folds per-library groups into one entry per series plus one for books outside any series. */
export function mergeGroupsBySeries(groups: readonly NewBookGroup[]): NewBookGroup[] {
  const merged = new Map<number | null, NewBookGroup>();
  for (const group of groups) {
    const existing = merged.get(group.seriesId);
    if (existing) {
      existing.count += group.count;
      existing.sampleBookId = Math.min(existing.sampleBookId, group.sampleBookId);
    } else {
      merged.set(group.seriesId, { ...group });
    }
  }
  return [...merged.values()];
}

export function totalNewBooks(groups: readonly NewBookGroup[]): number {
  return groups.reduce((sum, group) => sum + group.count, 0);
}

function launchUrl(target: NewBookLaunchTarget): string {
  const format = target.format?.toLowerCase();
  if (target.primaryFileId != null && format && READER_FORMATS.has(format)) {
    return `/read/${target.bookId}/${target.primaryFileId}?format=${format}`;
  }
  return `/book/${target.bookId}`;
}

/**
 * Builds the notification for one user's share of a batch. `groups` must already be merged by
 * series; `launchTarget` is only consulted when the batch holds exactly one book.
 */
export function buildNewBooksMessage(groups: readonly NewBookGroup[], launchTarget?: NewBookLaunchTarget | null): NewBooksMessage | null {
  const total = totalNewBooks(groups);
  if (total === 0) return null;

  const series = groups
    .filter((group) => group.seriesId !== null && group.count > 0)
    .sort((a, b) => b.count - a.count || (a.seriesName ?? '').localeCompare(b.seriesName ?? ''));
  const standaloneCount = groups.filter((group) => group.seriesId === null).reduce((sum, group) => sum + group.count, 0);

  if (total === 1) {
    const only = series[0] ?? null;
    const bookTitle = launchTarget?.title?.trim() || 'Untitled';
    return {
      title: only ? 'New chapter' : 'New book',
      body: only?.seriesName ? `${only.seriesName}: ${bookTitle}` : bookTitle,
      url: launchTarget ? launchUrl(launchTarget) : '/',
    };
  }

  const parts = series.slice(0, MAX_SERIES_IN_BODY).map((group) => `${group.seriesName ?? 'Untitled series'}: ${group.count} new`);
  const hiddenSeries = series.length - MAX_SERIES_IN_BODY;
  if (hiddenSeries > 0) parts.push(`${hiddenSeries} more series`);
  if (standaloneCount > 0) parts.push(series.length > 0 ? `${standaloneCount} other new` : `${standaloneCount} new books`);

  return {
    title: standaloneCount === 0 ? 'New chapters' : 'New books',
    body: parts.join(', '),
    url: series.length === 1 && standaloneCount === 0 ? `/series/${series[0].seriesId}` : '/',
  };
}
