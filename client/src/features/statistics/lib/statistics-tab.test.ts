import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rememberStatisticsTab, resolveStatisticsTab } from './statistics-tab'

function stubViewport(phone: boolean) {
  window.matchMedia = vi
    .fn<(query: string) => MediaQueryList>()
    .mockImplementation((query: string) => ({ matches: phone && query.includes('max-width'), media: query }) as MediaQueryList)
}

describe('resolveStatisticsTab', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('opens My Reading on a first visit from a phone and Library Stats on a wide screen', () => {
    stubViewport(true)
    expect(resolveStatisticsTab(undefined)).toBe('user')
    stubViewport(false)
    expect(resolveStatisticsTab(undefined)).toBe('library')
  })

  it('returns to the tab the reader last chose', () => {
    stubViewport(true)
    rememberStatisticsTab('library')
    expect(resolveStatisticsTab(undefined)).toBe('library')
  })

  it('lets an explicit tab query win over the remembered tab', () => {
    stubViewport(false)
    rememberStatisticsTab('library')
    expect(resolveStatisticsTab(['user'])).toBe('user')
  })

  it('falls back to the viewport default when storage throws', () => {
    stubViewport(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(resolveStatisticsTab('bogus')).toBe('user')
  })
})
