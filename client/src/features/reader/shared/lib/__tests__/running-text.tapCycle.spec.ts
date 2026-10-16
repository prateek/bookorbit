// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { EpubFooterRightItem } from '@bookorbit/types'
import { i18n } from '@/i18n'
import { buildRunningText, nextDistinctFooterRight, type RunningTextPosition } from '../running-text'

const t = (key: string, named?: Record<string, unknown>) => (named ? i18n.global.t(key, named) : i18n.global.t(key))

function position(overrides: Partial<RunningTextPosition> = {}): RunningTextPosition {
  return {
    chapterLabel: 'Chapter 430',
    bookTitle: 'Chapter 430',
    seriesName: 'Rise of the Living Forge',
    page: 3,
    pages: 12,
    chapterFraction: 0.2,
    bookFraction: 0.27,
    minutesLeftInChapter: 9.4,
    unreadAfter: 4,
    seriesIndex: '2.4',
    ...overrides,
  }
}

const standalone = { seriesName: null, seriesIndex: null, unreadAfter: null }

function shown(at: RunningTextPosition, item: EpubFooterRightItem): string {
  return buildRunningText(at, { runningHead: 'chapter', footerLeft: 'page', footerRight: item }, t).right
}

function taps(at: RunningTextPosition, from: EpubFooterRightItem, count: number): EpubFooterRightItem[] {
  const items: EpubFooterRightItem[] = []
  let item = from
  for (let i = 0; i < count; i++) {
    item = nextDistinctFooterRight(item, at, t)
    items.push(item)
  }
  return items
}

describe('footer tap cycle', () => {
  it('keeps the full cycle when every item reads differently', () => {
    expect(taps(position(), 'time-left', 4)).toEqual(['percent', 'unread', 'chapter', 'time-left'])
  })

  it('alternates time left and percent for a book outside a series, so every tap changes the line', () => {
    const at = position(standalone)
    const items = taps(at, 'time-left', 4)
    expect(items).toEqual(['percent', 'time-left', 'percent', 'time-left'])
    expect(items.map((item) => shown(at, item))).toEqual(['27%', '9 min left in chapter', '27%', '9 min left in chapter'])
  })

  it('changes the line on the first tap from an item saved while reading a series', () => {
    const at = position(standalone)
    expect(shown(at, nextDistinctFooterRight('unread', at, t))).not.toBe(shown(at, 'unread'))
    expect(shown(at, nextDistinctFooterRight('chapter', at, t))).not.toBe(shown(at, 'chapter'))
  })

  it('skips time left until it is known', () => {
    const at = position({ minutesLeftInChapter: null })
    expect(taps(at, 'percent', 3)).toEqual(['unread', 'chapter', 'percent'])
    expect(nextDistinctFooterRight('time-left', at, t)).toBe('unread')
  })

  it('settles on percent when it is the only thing to show', () => {
    const at = position({ ...standalone, minutesLeftInChapter: null })
    expect(nextDistinctFooterRight('percent', at, t)).toBe('percent')
    expect(nextDistinctFooterRight('time-left', at, t)).toBe('percent')
    expect(nextDistinctFooterRight('chapter', at, t)).toBe('percent')
  })

  it('brings a hidden slot back with something to read', () => {
    expect(nextDistinctFooterRight('off', position(), t)).toBe('time-left')
    expect(nextDistinctFooterRight('off', position({ minutesLeftInChapter: null }), t)).toBe('percent')
  })
})
