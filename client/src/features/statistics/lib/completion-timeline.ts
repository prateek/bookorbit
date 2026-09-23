import type { UserCompletionTimelinePoint } from '@bookorbit/types'

/**
 * The server pads the whole window with empty months. Start one month before the first completion so
 * the line has a baseline instead of years of flat zeros ahead of a single spike.
 */
export function fromFirstCompletion(points: UserCompletionTimelinePoint[]): UserCompletionTimelinePoint[] {
  const first = points.findIndex((point) => point.count > 0)
  return first === -1 ? points : points.slice(Math.max(0, first - 1))
}
