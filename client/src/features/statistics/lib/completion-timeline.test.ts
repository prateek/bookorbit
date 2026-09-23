import { describe, expect, it } from 'vitest'

import { fromFirstCompletion } from './completion-timeline'

describe('fromFirstCompletion', () => {
  it('drops the empty months ahead of the first completion but keeps one as a baseline', () => {
    const points = [
      { year: 2021, month: 9, count: 0 },
      { year: 2021, month: 10, count: 0 },
      { year: 2026, month: 8, count: 0 },
      { year: 2026, month: 9, count: 340 },
    ]

    expect(fromFirstCompletion(points)).toEqual(points.slice(2))
  })

  it('keeps the series whole when the first month already has completions or none exist', () => {
    const leading = [{ year: 2026, month: 9, count: 2 }]
    const empty = [{ year: 2026, month: 9, count: 0 }]
    expect(fromFirstCompletion(leading)).toEqual(leading)
    expect(fromFirstCompletion(empty)).toEqual(empty)
  })
})
