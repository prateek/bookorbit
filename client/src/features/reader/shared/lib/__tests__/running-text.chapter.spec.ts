// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { buildRunningText, nextFooterRight, type RunningTextPosition, type RunningTextSlots } from '../running-text'

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

const slots: RunningTextSlots = { runningHead: 'chapter', footerLeft: 'page', footerRight: 'chapter' }
const right = (overrides: Partial<RunningTextPosition> = {}) => buildRunningText(position(overrides), slots, t).right

describe('chapter number in the footer', () => {
  it('shows the series number with the time left in the chapter', () => {
    expect(right()).toBe('#2.4 · 9 min left in chapter')
  })

  it('shows the number alone until the time left is known', () => {
    expect(right({ minutesLeftInChapter: null })).toBe('#2.4')
  })

  it('reads as time left, or the book percent, for a book outside a series', () => {
    expect(right({ seriesIndex: null })).toBe('9 min left in chapter')
    expect(right({ seriesIndex: '  ' })).toBe('9 min left in chapter')
    expect(right({ seriesIndex: null, minutesLeftInChapter: null })).toBe('27%')
  })

  it('is part of the tap cycle, which then returns to time left', () => {
    expect(nextFooterRight('unread')).toBe('chapter')
    expect(nextFooterRight('chapter')).toBe('time-left')
  })
})
