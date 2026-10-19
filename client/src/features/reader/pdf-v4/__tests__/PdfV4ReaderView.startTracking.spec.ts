import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import type { LocationQuery } from 'vue-router'
import { useReaderTracking } from '../../shared/composables/useReaderTracking'

const mockRouterReplace = vi.fn<(to: unknown) => Promise<void>>().mockResolvedValue(undefined)
const mockRoute = { params: { bookId: '42', fileId: '101' }, query: { format: 'pdf' } as LocationQuery }

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn<(guard: () => Promise<void>) => void>(),
  onBeforeRouteUpdate: vi.fn<(guard: () => Promise<void>) => void>(),
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

const mockProgressSave = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
vi.mock('../../shared/composables/useReaderProgress', () => ({
  useReaderProgress: () => ({
    load: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    save: mockProgressSave,
    pageNumber: ref<number | null>(1),
    percentage: ref(0),
  }),
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

describe('PdfV4ReaderView start reading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoute.query = { format: 'pdf' }
  })

  it("starts a reread through the reader shell's rule when a finished book is peeked", async () => {
    const tracking = useReaderTracking(null)
    tracking.resolve('read')
    const wrapper = mount(PdfV4ReaderView, {
      props: { bookId: 42, fileId: 101, peekMode: tracking.peeking.value, startTracking: tracking.startTracking },
      global: { stubs: { PdfReaderContent } },
    })
    await flushPromises()

    wrapper.getComponent({ name: 'PdfReaderContent' }).vm.$emit('startReading')
    await flushPromises()

    expect(mockRouterReplace).toHaveBeenCalledWith({ name: 'reader', params: mockRoute.params, query: { format: 'pdf', mode: 'reread' } })
    expect(tracking.trackingEnabled.value).toBe(true)
    expect(mockProgressSave).toHaveBeenCalledOnce()
  })

  it('only drops the peek when mounted without the reader shell', async () => {
    mockRoute.query = { format: 'pdf', mode: 'peek' }
    const wrapper = mount(PdfV4ReaderView, {
      props: { bookId: 42, fileId: 101, peekMode: true },
      global: { stubs: { PdfReaderContent } },
    })
    await flushPromises()

    wrapper.getComponent({ name: 'PdfReaderContent' }).vm.$emit('startReading')
    await flushPromises()

    expect(mockRouterReplace).toHaveBeenCalledWith({ name: 'reader', params: mockRoute.params, query: { format: 'pdf' } })
  })
})
