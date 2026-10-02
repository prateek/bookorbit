import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
vi.mock('@/lib/api', () => ({ api: vi.fn<(...args: unknown[]) => Promise<unknown>>() }))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn<() => void>() } }))
vi.mock('@/features/auth/composables/useAuth', () => ({ useAuth: () => ({ user: ref(null) }) }))
import { useReaderSettings } from './useReaderSettings'

beforeEach(() => localStorage.clear())

describe('saved reader layout', () => {
  it('restores defaults and book overrides independently after reload', async () => {
    const settings = useReaderSettings(42, 'epub')
    await settings.load()
    settings.updateSettings({ informationDisplay: 'progress', verticalMargin: 12, gap: 0.03 })
    settings.updateSettings({ informationDisplay: 'hidden', verticalMargin: 0 }, 'book')
    const reopened = useReaderSettings(42, 'epub')
    await reopened.load()
    expect(reopened.effective.value).toMatchObject({ informationDisplay: 'hidden', verticalMargin: 0, gap: 0.03 })
    const nextBook = useReaderSettings(43, 'epub')
    await nextBook.load()
    expect(nextBook.effective.value).toMatchObject({ informationDisplay: 'progress', verticalMargin: 12, gap: 0.03 })
    reopened.resetBookSettings()
    expect(reopened.effective.value).toMatchObject({ informationDisplay: 'progress', verticalMargin: 12 })
  })

  it('drops invalid saved values and supplies defaults for older preferences', async () => {
    localStorage.setItem('reader:book:42', JSON.stringify({ informationDisplay: 'clock', verticalMargin: -1, fontSize: 17 }))
    const settings = useReaderSettings(42, 'epub')
    await settings.load()
    expect(settings.bookDelta.value).toEqual({ fontSize: 17 })
    expect(settings.effective.value).toMatchObject({ informationDisplay: 'full', verticalMargin: 24 })
  })
})
