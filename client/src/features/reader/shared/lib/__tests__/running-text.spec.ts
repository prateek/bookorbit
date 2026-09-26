// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { buildRunningText, buildToolbarTitle, nextFooterRight, type RunningTextPosition, type RunningTextSlots } from '../running-text'

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
    ...overrides,
  }
}

const slots: RunningTextSlots = { runningHead: 'chapter', footerLeft: 'page', footerRight: 'time-left' }

describe('buildRunningText', () => {
  it('shows the chapter, the page within it and the time left in it', () => {
    expect(buildRunningText(position(), slots, t)).toEqual({ head: 'Chapter 430', left: '3 of 12', right: '9 min left in chapter' })
  })

  it('prefixes the series when asked and the book has one', () => {
    expect(buildRunningText(position(), { ...slots, runningHead: 'series-chapter' }, t).head).toBe('Rise of the Living Forge · Chapter 430')
    expect(buildRunningText(position({ seriesName: null }), { ...slots, runningHead: 'series-chapter' }, t).head).toBe('Chapter 430')
  })

  it('falls back to the book title when the contents do not name the chapter', () => {
    expect(buildRunningText(position({ chapterLabel: '  ' }), slots, t).head).toBe('Chapter 430')
    expect(buildRunningText(position({ chapterLabel: '', bookTitle: null }), slots, t).head).toBe('')
  })

  it('counts the pages left in the chapter, and says when this is the last', () => {
    const left = { ...slots, footerLeft: 'pages-left' as const }
    expect(buildRunningText(position(), left, t).left).toBe('9 pages left in chapter')
    expect(buildRunningText(position({ page: 11 }), left, t).left).toBe('1 page left in chapter')
    expect(buildRunningText(position({ page: 12 }), left, t).left).toBe('Last page in chapter')
  })

  it('uses the chapter percentage when there are no pages, as in scrolled flow', () => {
    expect(buildRunningText(position({ page: null, pages: null, chapterFraction: 0.456 }), slots, t).left).toBe('46% of chapter')
    expect(buildRunningText(position({ page: null, pages: null, chapterFraction: null }), slots, t).left).toBe('')
  })

  it('shows the book percentage when asked, or when time left is unknown', () => {
    expect(buildRunningText(position(), { ...slots, footerRight: 'percent' }, t).right).toBe('27%')
    expect(buildRunningText(position({ minutesLeftInChapter: null }), slots, t).right).toBe('27%')
  })

  it('formats long and short times', () => {
    expect(buildRunningText(position({ minutesLeftInChapter: 0.4 }), slots, t).right).toBe('< 1 min left in chapter')
    expect(buildRunningText(position({ minutesLeftInChapter: 60 }), slots, t).right).toBe('1 hr left in chapter')
    expect(buildRunningText(position({ minutesLeftInChapter: 95 }), slots, t).right).toBe('1 hr 35 min left in chapter')
    expect(buildRunningText(position({ minutesLeftInChapter: 59.6 }), slots, t).right).toBe('1 hr left in chapter')
    expect(buildRunningText(position({ minutesLeftInChapter: 119.7 }), slots, t).right).toBe('2 hr left in chapter')
  })

  it('leaves a slot empty when it is off', () => {
    expect(buildRunningText(position(), { runningHead: 'off', footerLeft: 'off', footerRight: 'off' }, t)).toEqual({ head: '', left: '', right: '' })
  })
})

describe('buildToolbarTitle', () => {
  it('puts the series above the chapter', () => {
    expect(buildToolbarTitle(position())).toEqual({ series: 'Rise of the Living Forge', chapter: 'Chapter 430' })
    expect(buildToolbarTitle(position({ seriesName: ' ' }))).toEqual({ series: null, chapter: 'Chapter 430' })
  })
})

describe('nextFooterRight', () => {
  it('cycles between time left and percent, and a tap brings back a hidden slot', () => {
    expect(nextFooterRight('time-left')).toBe('percent')
    expect(nextFooterRight('percent')).toBe('time-left')
    expect(nextFooterRight('off')).toBe('time-left')
  })
})
