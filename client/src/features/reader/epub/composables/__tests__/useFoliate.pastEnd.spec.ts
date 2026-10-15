import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
  getAccessToken: vi.fn<() => string | null>(),
}))

vi.mock('@/features/offline/offline-session', () => ({
  openDownloadedFile: vi.fn<() => Promise<Blob | null>>().mockResolvedValue(null),
}))

vi.mock('../useFoliateAnnotations', () => ({
  useFoliateAnnotations: () => ({
    reAddAll: vi.fn<() => void>(),
    handleDrawAnnotationEvent: vi.fn<() => void>(),
  }),
}))

vi.mock('../useFoliateSelection', () => ({
  useFoliateSelection: () => ({
    setHandler: vi.fn<() => void>(),
    setInteractionStartHandler: vi.fn<() => void>(),
    handleSelectionEnd: vi.fn<() => void>(),
    handleSelectionChange: vi.fn<() => void>(),
    handleInteractionStart: vi.fn<() => void>(),
    handleInteractionEnd: vi.fn<() => void>(),
  }),
}))

vi.mock('../useFoliateInput', () => ({
  useFoliateInput: () => ({
    cleanup: vi.fn<() => void>(),
    attachIframeClicks: vi.fn<() => void>(),
    suppressNextTapNavigation: vi.fn<() => void>(),
  }),
}))

import { api } from '@/lib/api'
import { useFoliate } from '../useFoliate'

describe('useFoliate past-end', () => {
  let container: HTMLDivElement
  let renderer: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      if (tag !== 'foliate-view') return originalCreateElement(tag, options)
      const view = originalCreateElement('div')
      // Foliate keeps its page renderer inside the view's shadow root.
      renderer = originalCreateElement('div')
      view.attachShadow({ mode: 'open' }).append(renderer)
      Object.assign(view, {
        open: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        goTo: vi.fn<() => Promise<unknown>>().mockResolvedValue({ index: 0 }),
        renderer: Object.assign(renderer, { setAttribute: vi.fn<() => void>(), removeAttribute: vi.fn<() => void>() }),
        destroy: vi.fn<() => void>(),
      })
      return view
    })
    vi.spyOn(customElements, 'get').mockReturnValue(class {} as CustomElementConstructor)
    vi.mocked(api).mockResolvedValue({ ok: true, json: vi.fn<() => Promise<unknown>>().mockResolvedValue({}) } as unknown as Response)
    ;(window as { makeStreamingBook?: unknown }).makeStreamingBook = vi.fn<() => Promise<unknown>>().mockResolvedValue({})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    container.remove()
    delete (window as { makeStreamingBook?: unknown }).makeStreamingBook
  })

  function turnPastEnd() {
    renderer.dispatchEvent(new CustomEvent('past-end', { bubbles: true, composed: true }))
  }

  it('reports a page turn past the end of the book', async () => {
    const onPastEnd = vi.fn<() => void>()
    const foliate = useFoliate(() => container, undefined, undefined, undefined, undefined, undefined, onPastEnd)
    await foliate.open(1, 2, 'epub', null)

    turnPastEnd()
    turnPastEnd()

    expect(onPastEnd).toHaveBeenCalledTimes(2)
  })
})
