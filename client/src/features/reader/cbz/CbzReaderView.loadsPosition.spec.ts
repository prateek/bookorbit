import { computed, nextTick, ref, unref, type MaybeRef } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CbzReaderView from './CbzReaderView.vue'

const SAVED_PAGE = 7

const mocks = vi.hoisted(() => ({
  progressOptions: null as { trackingEnabled?: MaybeRef<boolean>; loadsPosition?: MaybeRef<boolean> } | null,
  scrollToIndex: vi.fn<(index: number, options: { align: string }) => void>(),
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

vi.mock('vue-router', () => ({
  onBeforeRouteUpdate: vi.fn<(guard: () => Promise<void>) => void>(),
  useRoute: () => ({ params: { bookId: '11', fileId: '22' }, query: { format: 'cbz' } }),
  useRouter: () => ({
    back: vi.fn<() => void>(),
    push: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    replace: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }),
  onBeforeRouteLeave: vi.fn<(guard: () => Promise<void>) => void>(),
}))

vi.mock('@tanstack/vue-virtual', () => ({
  useVirtualizer: (options: { value: { count: number } }) =>
    computed(() => ({
      getVirtualItems: () => [],
      getTotalSize: () => options.value.count * 1_000,
      measureElement: vi.fn<(element?: unknown) => void>(),
      scrollToIndex: mocks.scrollToIndex,
    })),
}))

vi.mock('./composables/useCbz', () => ({
  useCbz: () => {
    const pageCount = ref(0)
    return {
      pageCount,
      bookTitle: ref('Chapter'),
      loading: ref(false),
      error: ref(null),
      seriesId: ref(42),
      pageUrl: (page: number) => `/api/v1/cbz/files/22/pages/${page}`,
      load: async () => {
        pageCount.value = 10
      },
    }
  },
}))

vi.mock('../shared/composables/useSeriesNextBook', () => ({
  useSeriesNextBook: () => ({ nextBook: computed(() => null), load: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }),
}))

vi.mock('../shared/composables/useReaderSettings', () => ({
  useReaderSettings: () => ({
    effective: computed(() => ({
      fitMode: 'fit-page',
      viewMode: 'single',
      scrollMode: 'infinite',
      direction: 'ltr',
      spreadAlignment: 'normal',
      spreadGap: 0,
      forceTwoPage: false,
      widePageSingletonMode: 'auto',
      bgColor: 'black',
      autoAdvance: false,
    })),
    isCustomized: ref(false),
    load: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    updateBookSettings: vi.fn<(patch: unknown) => void>(),
    resetBookSettings: vi.fn<() => void>(),
  }),
}))

/** Stands in for the saved position: only a progress that loads positions gets it back. */
vi.mock('../shared/composables/useReaderProgress', () => ({
  useReaderProgress: (_bookId: number, _fileId: number, _elapsed: unknown, _footer: number, options: typeof mocks.progressOptions) => {
    mocks.progressOptions = options
    const pageNumber = ref<number | null>(null)
    const percentage = ref(0)
    return {
      pageNumber,
      percentage,
      load: async () => {
        if (!unref(options?.loadsPosition ?? options?.trackingEnabled ?? true)) return
        pageNumber.value = SAVED_PAGE
        percentage.value = 70
      },
      save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
  },
}))

vi.mock('../shared/composables/useReadingSession', () => ({
  useReadingSession: () => ({ onActivity: vi.fn<() => void>(), elapsedMinutes: ref(0) }),
}))

vi.mock('../shared/composables/useVisibility', () => ({
  useVisibility: () => ({
    headerVisible: ref(false),
    footerVisible: ref(false),
    isPinned: ref(false),
    handleMiddleTap: vi.fn<() => void>(),
    togglePinned: vi.fn<() => void>(),
    showHeader: vi.fn<() => void>(),
    showFooter: vi.fn<() => void>(),
    setVisibilityLock: vi.fn<(locked: boolean) => void>(),
  }),
}))

vi.mock('../shared/composables/useFullscreen', () => ({
  useFullscreen: () => ({ isFullscreen: ref(false), toggleFullscreen: vi.fn<() => void>() }),
}))

async function openComic(props: { peekMode?: boolean; loadsPosition?: boolean }) {
  const wrapper = shallowMount(CbzReaderView, { props: { bookId: 11, fileId: 22, ...props } })
  await flushPromises()
  await nextTick()
  return wrapper
}

describe('CbzReaderView saved position', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.progressOptions = null
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn<(handle: number) => void>())
  })

  it('reopens a returning peek at the saved page while staying untracked', async () => {
    const wrapper = await openComic({ peekMode: true, loadsPosition: true })

    expect(unref(mocks.progressOptions?.trackingEnabled)).toBe(false)
    expect(unref(mocks.progressOptions?.loadsPosition)).toBe(true)
    expect(mocks.scrollToIndex).toHaveBeenLastCalledWith(SAVED_PAGE - 1, { align: 'start' })

    wrapper.unmount()
  })

  it('opens a fresh peek at the first page', async () => {
    const wrapper = await openComic({ peekMode: true })

    expect(unref(mocks.progressOptions?.loadsPosition)).toBe(false)
    expect(mocks.scrollToIndex).toHaveBeenLastCalledWith(0, { align: 'start' })

    wrapper.unmount()
  })

  it('loads the saved page whenever it tracks', async () => {
    const wrapper = await openComic({})

    expect(unref(mocks.progressOptions?.loadsPosition)).toBe(true)
    expect(mocks.scrollToIndex).toHaveBeenLastCalledWith(SAVED_PAGE - 1, { align: 'start' })

    wrapper.unmount()
  })
})
