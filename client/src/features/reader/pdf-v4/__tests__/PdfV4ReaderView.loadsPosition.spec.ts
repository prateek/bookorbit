import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref, unref, type MaybeRef } from 'vue'
import type { LocationQuery } from 'vue-router'

const mockRouterReplace = vi.fn<(to: unknown) => Promise<void>>().mockResolvedValue(undefined)
const mockRoute = { params: { bookId: '42', fileId: '101' }, query: { format: 'pdf' } as LocationQuery }

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ back: vi.fn<() => void>(), replace: mockRouterReplace }),
}))

vi.mock('@/lib/api', () => ({
  api: vi.fn<() => Promise<Response>>(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 })),
}))

vi.mock('../../shared/composables/useReaderSettings', () => ({
  useReaderSettings: () => ({
    load: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    effective: ref({ scrollMode: 'page', spread: 'none', zoomMode: 'fit-page', customScale: 1, rotation: 0 }),
    updateBookSettings: vi.fn<() => void>(),
  }),
}))

const SAVED_PAGE = 9

type ProgressOptions = { trackingEnabled?: MaybeRef<boolean>; loadsPosition?: MaybeRef<boolean> }
let progressOptions: ProgressOptions | null = null

/** Stands in for the saved position: only a progress that loads positions gets it back. */
vi.mock('../../shared/composables/useReaderProgress', () => ({
  useReaderProgress: (_bookId: number, _fileId: number, _elapsed: unknown, _footer: number, options: ProgressOptions) => {
    progressOptions = options
    const pageNumber = ref<number | null>(null)
    return {
      load: async () => {
        if (unref(options.loadsPosition ?? options.trackingEnabled ?? true)) pageNumber.value = SAVED_PAGE
      },
      save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      pageNumber,
      percentage: ref(0),
    }
  },
}))

vi.mock('../../shared/composables/useReadingSession', () => ({
  useReadingSession: () => ({ onActivity: vi.fn<() => void>(), elapsedMinutes: ref(0) }),
}))

vi.mock('@embedpdf/engines/vue', () => ({
  usePdfiumEngine: () => ({ engine: ref({ id: 'engine' }), isLoading: ref(false), error: ref(null) }),
}))

const documentManager = {
  openDocumentBuffer: () => ({
    toPromise: async () => ({ documentId: 'document-1', task: { toPromise: async () => ({ pageCount: 12 }) } }),
  }),
  closeDocument: () => ({ toPromise: async () => undefined }),
  getDocumentState: () => undefined,
}
const registry = {
  pluginsReady: async () => undefined,
  isDestroyed: () => false,
  getPlugin: () => ({ provides: () => documentManager }),
}

vi.mock('@embedpdf/core/vue', () => ({
  EmbedPDF: defineComponent({
    name: 'EmbedPDF',
    props: ['engine', 'plugins', 'config', 'onInitialized'],
    setup(props, { slots }) {
      void props.onInitialized?.(registry)
      return () => h('div', slots.default?.({ pluginsReady: true, activeDocumentId: 'document-1', activeDocument: { status: 'loaded' } }))
    },
  }),
}))

const { default: PdfV4ReaderView } = await import('../PdfV4ReaderView.vue')

const PdfReaderContent = {
  name: 'PdfReaderContent',
  props: ['documentId', 'initialPage', 'settings', 'peekMode'],
  emits: ['back', 'pageChange', 'retry', 'settingsChange', 'startReading'],
  template: '<div />',
}

describe('PdfV4ReaderView saved position', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    progressOptions = null
  })

  async function openedPage(props: { peekMode?: boolean; loadsPosition?: boolean }) {
    const wrapper = mount(PdfV4ReaderView, { props: { bookId: 42, fileId: 101, ...props }, global: { stubs: { PdfReaderContent } } })
    await flushPromises()
    return wrapper.getComponent({ name: 'PdfReaderContent' }).props('initialPage')
  }

  it('reopens a returning peek at the saved page while staying untracked', async () => {
    expect(await openedPage({ peekMode: true, loadsPosition: true })).toBe(SAVED_PAGE)
    expect(unref(progressOptions?.trackingEnabled)).toBe(false)
  })

  it('opens a fresh peek at the first page', async () => {
    expect(await openedPage({ peekMode: true })).toBe(1)
  })

  it('loads the saved page whenever it tracks', async () => {
    expect(await openedPage({})).toBe(SAVED_PAGE)
  })
})
