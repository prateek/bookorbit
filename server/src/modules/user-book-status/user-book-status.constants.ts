import type { ReadingAttemptOrigin, ReadStatus, ReadStatusSource } from '@bookorbit/types';

export const READ_STATUSES: readonly ReadStatus[] = ['unread', 'want_to_read', 'reading', 'on_hold', 'rereading', 'read', 'skimmed', 'abandoned'];

export const READ_STATUS_SOURCES: readonly ReadStatusSource[] = ['auto', 'manual'];

export const READING_DATE_ERROR_CODES = {
  invalidOrder: 'READING_DATES_INVALID_ORDER',
  startedInFuture: 'READING_DATE_STARTED_IN_FUTURE',
  finishedInFuture: 'READING_DATE_FINISHED_IN_FUTURE',
  statusConflict: 'READING_DATES_STATUS_CONFLICT',
} as const;

/**
 * Progress at or below this percentage, with no session or reread evidence behind it, is a peek
 * rather than a start. Opening a short chapter-length book reports the end of its first page,
 * which must not mark the book Reading on its own.
 */
export const PROGRESS_ONLY_START_FLOOR = 2;

/**
 * Whether a progress report alone (no meaningful session activity) starts a reading attempt.
 * Kobo pushes are measured against the user's own Kobo sync threshold, so the peek floor, which
 * stands in for the library's near-zero default, does not override it.
 */
export function progressAloneStartsReading(progress: number, readThreshold: number, origin: ReadingAttemptOrigin): boolean {
  if (progress <= 0 || progress < readThreshold) return false;
  return origin === 'kobo' || progress > PROGRESS_ONLY_START_FLOOR;
}

const READ_STATUS_SET = new Set<ReadStatus>(READ_STATUSES);
const READ_STATUS_SOURCE_SET = new Set<ReadStatusSource>(READ_STATUS_SOURCES);

export function isReadStatus(value: string): value is ReadStatus {
  return READ_STATUS_SET.has(value as ReadStatus);
}

export function isReadStatusSource(value: string): value is ReadStatusSource {
  return READ_STATUS_SOURCE_SET.has(value as ReadStatusSource);
}
