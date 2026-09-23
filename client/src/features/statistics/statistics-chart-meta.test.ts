import { describe, expect, it } from 'vitest'

import { LIBRARY_CHART_IDS, STATISTICS_CHART_META, USER_CHART_IDS } from './statistics-chart-meta'

describe('statistics chart meta', () => {
  it('places the Where You Read chart at the end of the user tab defaults', () => {
    expect(USER_CHART_IDS.at(-1)).toBe('reading-source-distribution')
  })

  it('leads the library tab with what is in the library and keeps every library chart exactly once', () => {
    const libraryMetaIds = Object.entries(STATISTICS_CHART_META)
      .filter(([, meta]) => meta.category === 'library')
      .map(([id]) => id)

    expect(LIBRARY_CHART_IDS.slice(0, 2)).toEqual(['top-series', 'books-added-over-time'])
    expect(new Set(LIBRARY_CHART_IDS).size).toBe(LIBRARY_CHART_IDS.length)
    expect([...LIBRARY_CHART_IDS].sort()).toEqual(libraryMetaIds.sort())
    expect(LIBRARY_CHART_IDS.indexOf('metadata-freshness-gauge')).toBeGreaterThan(LIBRARY_CHART_IDS.indexOf('top-authors'))
  })
})
