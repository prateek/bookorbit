import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { READER_GROUP_DEFAULTS } from '@bookorbit/types'

vi.mock('@/lib/api', () => ({ api: vi.fn<(...args: unknown[]) => Promise<unknown>>() }))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn<(...args: unknown[]) => unknown>() } }))
vi.mock('@/features/auth/composables/useAuth', () => ({ useAuth: () => ({ user: ref(null) }) }))

import { useReaderSettings } from './useReaderSettings'

const BOOK_FILE_ID = 42
const { runningHead: _head, footerLeft: _left, footerRight: _right, ...savedBeforeSlots } = READER_GROUP_DEFAULTS.epub

async function effective(accountDefault: Record<string, unknown> | null, book: Record<string, unknown> | null) {
  if (accountDefault) localStorage.setItem('reader:default:epub', JSON.stringify(accountDefault))
  if (book) localStorage.setItem(`reader:book:${BOOK_FILE_ID}`, JSON.stringify(book))
  const settings = useReaderSettings(BOOK_FILE_ID, 'epub')
  await settings.load()
  return settings
}

beforeEach(() => localStorage.clear())

describe('useReaderSettings header and footer slots', () => {
  it('reads an account footer mode saved before the slots as the matching slots', async () => {
    const settings = await effective({ ...savedBeforeSlots, footerDisplayMode: 2 }, null)

    expect(settings.effective.value).toMatchObject({ footerLeft: 'pages-left', footerRight: 'time-left' })
  })

  it('prefers saved slots over the older footer mode', async () => {
    const settings = await effective(
      { ...savedBeforeSlots, footerDisplayMode: 2, runningHead: 'off', footerLeft: 'off', footerRight: 'percent' },
      null,
    )

    expect(settings.effective.value).toMatchObject({ runningHead: 'off', footerLeft: 'off', footerRight: 'percent' })
  })

  it('does not let a book’s old footer mode override the account’s slots', async () => {
    const settings = await effective({ ...savedBeforeSlots, footerRight: 'time-left' }, { footerDisplayMode: 0 })

    expect(settings.effective.value).toMatchObject({ footerLeft: 'page', footerRight: 'time-left' })
  })

  it('drops an unknown slot value', async () => {
    const settings = await effective(null, { footerLeft: 'clock', fontSize: 20 })

    expect(settings.bookDelta.value).toEqual({ fontSize: 20 })
  })
})
