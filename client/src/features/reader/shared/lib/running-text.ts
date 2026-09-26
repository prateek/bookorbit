import type { EpubFooterLeftItem, EpubFooterRightItem, EpubRunningHeadMode } from '@bookorbit/types'

/** Where the reader is, as the running head and foot describe it. */
export interface RunningTextPosition {
  /** Contents label of the current chapter; empty when the book's contents do not cover it. */
  chapterLabel: string
  bookTitle: string | null
  seriesName: string | null
  /** 1-based screen page within the current chapter; null in scrolled flow or before layout. */
  page: number | null
  pages: number | null
  /** 0-1 within the current chapter. */
  chapterFraction: number | null
  /** 0-1 within the whole book. */
  bookFraction: number
  minutesLeftInChapter: number | null
  /** Unread books after this one in its series; null outside a series or until known. */
  unreadAfter: number | null
}

export interface RunningTextSlots {
  runningHead: EpubRunningHeadMode
  footerLeft: EpubFooterLeftItem
  footerRight: EpubFooterRightItem
}

export interface RunningText {
  head: string
  left: string
  right: string
}

type Translate = (key: string, named?: Record<string, unknown>) => string

const RIGHT_CYCLE: EpubFooterRightItem[] = ['time-left', 'percent', 'unread']

/** The foot's right slot after a tap; "off" is left to the settings, so a tap never hides the line. */
export function nextFooterRight(current: EpubFooterRightItem): EpubFooterRightItem {
  const index = RIGHT_CYCLE.indexOf(current)
  return RIGHT_CYCLE[(index + 1) % RIGHT_CYCLE.length] ?? RIGHT_CYCLE[0]!
}

export function formatMinutes(minutes: number, t: Translate): string {
  if (minutes < 1) return t('reader.runningText.underAMinute')
  const total = Math.round(minutes)
  if (total < 60) return t('reader.runningText.minutes', { n: total })
  const hours = Math.floor(total / 60)
  const remainder = total % 60
  return remainder === 0 ? t('reader.runningText.hours', { h: hours }) : t('reader.runningText.hoursMinutes', { h: hours, m: remainder })
}

function chapterName(position: RunningTextPosition): string {
  return position.chapterLabel.trim() || position.bookTitle?.trim() || ''
}

/** The two-line title shown in the reader toolbar: series above, chapter below. */
export function buildToolbarTitle(position: RunningTextPosition): { series: string | null; chapter: string } {
  return { series: position.seriesName?.trim() || null, chapter: chapterName(position) }
}

function buildHead(position: RunningTextPosition, mode: EpubRunningHeadMode): string {
  if (mode === 'off') return ''
  const chapter = chapterName(position)
  const series = position.seriesName?.trim()
  if (mode === 'series-chapter' && series) return chapter ? `${series} · ${chapter}` : series
  return chapter
}

function hasPages(position: RunningTextPosition): position is RunningTextPosition & { page: number; pages: number } {
  return position.page !== null && position.pages !== null && position.pages > 0
}

function buildLeft(position: RunningTextPosition, item: EpubFooterLeftItem, t: Translate): string {
  if (item === 'off') return ''
  if (hasPages(position)) {
    if (item === 'page') return t('reader.runningText.pageOf', { page: position.page, pages: position.pages })
    const left = position.pages - position.page
    return left === 0 ? t('reader.runningText.lastPage') : t('reader.runningText.pagesLeft', { count: left })
  }
  if (position.chapterFraction === null) return ''
  return t('reader.runningText.chapterPercent', { pct: Math.round(position.chapterFraction * 100) })
}

function buildRight(position: RunningTextPosition, item: EpubFooterRightItem, t: Translate): string {
  if (item === 'off') return ''
  const percent = t('reader.runningText.percent', { pct: Math.round(position.bookFraction * 100) })
  if (item === 'percent') return percent
  if (item === 'unread') {
    if (position.unreadAfter === null) return percent
    return position.unreadAfter === 0 ? t('reader.runningText.caughtUp') : t('reader.runningText.unreadAfter', { count: position.unreadAfter })
  }
  if (position.minutesLeftInChapter === null) return percent
  return t('reader.runningText.timeLeftInChapter', { time: formatMinutes(position.minutesLeftInChapter, t) })
}

export function buildRunningText(position: RunningTextPosition, slots: RunningTextSlots, t: Translate): RunningText {
  return {
    head: buildHead(position, slots.runningHead),
    left: buildLeft(position, slots.footerLeft, t),
    right: buildRight(position, slots.footerRight, t),
  }
}

/** The foot and scroll strip in one line, for places with room for a single label. */
export function joinFoot(text: RunningText): string {
  return [text.left, text.right].filter(Boolean).join(' · ')
}
