import type { SeriesVolumeSlot, SeriesVolumeStatus } from '@bookorbit/types';
import { SERIES_VOLUME_SLOT_LIMIT } from '@bookorbit/types';

import type { SeriesMemberRow } from '../series.repository';
import { computeSeriesGaps, resolveLadderRange } from './series-gaps.utils';

export type SeriesLadder = {
  volumes: SeriesVolumeSlot[];
  truncated: boolean;
  gaps: number[];
};

const STATUS_RANK: Record<SeriesVolumeStatus, number> = { read: 3, reading: 2, unread: 1, missing: 0 };

function memberStatus(status: string | null): SeriesVolumeStatus {
  if (status === 'read') return 'read';
  if (status === 'reading') return 'reading';
  return 'unread';
}

function integerIndexOf(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * The volume ladder a list row draws: one slot per number the series should have, plus the books
 * that carry no usable number, at the end.
 *
 * Two books can sit on the same number - the same volume held in two libraries, or in two formats -
 * and the slot then shows the furthest the user got with either, because that is what "have I read
 * volume four" means to the person asking.
 *
 * The up-next pointer is not derived here: the ladder is capped, and "next" has to hold for a
 * series of any length, so the repository computes it in SQL.
 */
export function buildVolumeLadder(params: {
  members: SeriesMemberRow[];
  truncated: boolean;
  bookCount: number;
  expectedBookCount: number | null;
}): SeriesLadder {
  const { members, bookCount, expectedBookCount } = params;

  if (members.length === 0) {
    return { volumes: [], truncated: params.truncated, gaps: [] };
  }

  // A series we could not read in full can still be counted, but naming a volume missing needs
  // every sibling in hand, so a truncated one draws no ladder rather than a wrong one.
  if (params.truncated) {
    return { volumes: [], truncated: true, gaps: [] };
  }

  const indices = members.map((m) => m.seriesIndex).filter((idx): idx is string => idx !== null);
  const gaps = computeSeriesGaps(indices, bookCount, expectedBookCount);
  const range = resolveLadderRange(indices, bookCount, expectedBookCount);

  const byIndex = new Map<number, SeriesMemberRow>();
  const unnumbered: SeriesMemberRow[] = [];
  for (const member of members) {
    const index = integerIndexOf(member.seriesIndex);
    if (index === null || !range || index < range.from || index > range.to) {
      unnumbered.push(member);
      continue;
    }
    const held = byIndex.get(index);
    if (!held || STATUS_RANK[memberStatus(member.status)] > STATUS_RANK[memberStatus(held.status)]) {
      byIndex.set(index, member);
    }
  }

  const volumes: SeriesVolumeSlot[] = [];
  let truncated = false;

  if (range) {
    for (let i = range.from; i <= range.to; i++) {
      if (volumes.length >= SERIES_VOLUME_SLOT_LIMIT) {
        truncated = true;
        break;
      }
      const member = byIndex.get(i);
      volumes.push(
        member
          ? { index: i, bookId: member.bookId, title: member.title, status: memberStatus(member.status) }
          : { index: i, bookId: null, title: null, status: 'missing' },
      );
    }
  }

  for (const member of unnumbered) {
    if (volumes.length >= SERIES_VOLUME_SLOT_LIMIT) {
      truncated = true;
      break;
    }
    volumes.push({ index: null, bookId: member.bookId, title: member.title, status: memberStatus(member.status) });
  }

  return { volumes, truncated, gaps };
}
