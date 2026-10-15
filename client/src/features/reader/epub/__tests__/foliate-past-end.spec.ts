import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type Renderer = HTMLElement & {
  next: () => Promise<unknown>
  prev: () => Promise<unknown>
  goTo: (target: { index: number }) => Promise<void>
}

let FixedLayout: new () => Renderer & { open: (book: unknown) => void }
let Paginator: new () => Renderer & { sections: { load: () => Promise<string> }[] }

beforeAll(async () => {
  Object.assign(globalThis, { EventTarget: window.EventTarget, CustomEvent: window.CustomEvent, Event: window.Event, CSS: window.CSS })
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.requestAnimationFrame ??= (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0)
  globalThis.matchMedia ??= () =>
    ({ matches: false, addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() }) as unknown as MediaQueryList

  const fixedLayoutModulePath = '../../../../../public/assets/foliate/fixed-layout.js'
  const paginatorModulePath = '../../../../../public/assets/foliate/paginator.js'
  ;({ FixedLayout } = (await import(fixedLayoutModulePath)) as { FixedLayout: typeof FixedLayout })
  ;({ Paginator } = (await import(paginatorModulePath)) as { Paginator: typeof Paginator })
})

// jsdom never loads iframe sources, so each frame gets a blank document and a load event.
function stubFrames() {
  const originalCreateElement = document.createElement.bind(document)
  return vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = originalCreateElement(tagName)
    if (tagName !== 'iframe') return element
    const frameDoc = document.implementation.createHTMLDocument('frame')
    frameDoc.head.innerHTML = '<meta name="viewport" content="width=100,height=200">'
    Object.defineProperty(frameDoc, 'fonts', { value: { ready: new Promise(() => {}) } })
    Object.defineProperty(frameDoc, 'defaultView', { value: window })
    Object.defineProperty(element, 'contentDocument', { configurable: true, value: frameDoc })
    Object.defineProperty(element, 'src', {
      configurable: true,
      get() {
        return this.getAttribute('src') ?? ''
      },
      set(value) {
        this.setAttribute('src', value)
        queueMicrotask(() => this.dispatchEvent(new window.Event('load')))
      },
    })
    return element
  })
}

// foliate-view keeps its renderer in a closed shadow root, so the reader hears these events
// only if they bubble and are composed.
function listen(host: HTMLElement) {
  const events: string[] = []
  host.addEventListener('past-end', () => events.push('past-end'))
  host.addEventListener('past-start', () => events.push('past-start'))
  return events
}

function sections(count: number) {
  return Array.from({ length: count }, (_, i) => ({ load: vi.fn<() => Promise<string>>().mockResolvedValue(`section-${i}.xhtml`) }))
}

describe('Foliate turns past the ends of a book', () => {
  let host: HTMLElement | null = null

  function mount(renderer: HTMLElement) {
    host = document.createElement('div')
    document.body.append(host)
    host.attachShadow({ mode: 'closed' }).append(renderer)
  }

  const screen = { x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 600, width: 400, height: 600, toJSON: () => ({}) } as DOMRect

  beforeEach(() => {
    stubFrames()
    // A one-screen section: the container, the rendered view and its text are the same size.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(screen)
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => screen })
  })

  afterEach(() => {
    host?.remove()
    host = null
    vi.restoreAllMocks()
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  })

  async function openFixedLayout(count: number) {
    const fixedLayout = new FixedLayout()
    mount(fixedLayout)
    fixedLayout.open({ rendition: { layout: 'pre-paginated', spread: 'none' }, sections: sections(count) })
    await fixedLayout.goTo({ index: count - 1 })
    return fixedLayout
  }

  async function openPaginator(count: number, flow: 'scrolled' | 'paginated', index = count - 1) {
    const paginator = new Paginator()
    paginator.setAttribute('flow', flow)
    mount(paginator)
    paginator.sections = sections(count)
    await paginator.goTo({ index })
    return paginator
  }

  it('signals a fixed-layout turn past the last spread', async () => {
    const fixedLayout = await openFixedLayout(1)
    const events = listen(host!)

    await fixedLayout.next()
    await fixedLayout.prev()

    expect(events).toEqual(['past-end', 'past-start'])
  })

  it('turns a fixed-layout book to its previous spread without signalling', async () => {
    const fixedLayout = await openFixedLayout(2)
    const events = listen(host!)

    await fixedLayout.prev()

    expect(events).toEqual([])
  })

  it('signals a paginated turn past the last page', async () => {
    const paginator = await openPaginator(1, 'paginated')
    const events = listen(host!)

    await paginator.next()

    expect(events).toEqual(['past-end'])
  })

  it('signals a scrolled turn past the bottom and releases the turn lock', async () => {
    const paginator = await openPaginator(1, 'scrolled')
    const events = listen(host!)

    await expect(paginator.next()).resolves.toBeUndefined()
    await paginator.prev()

    expect(events).toEqual(['past-end', 'past-start'])
  })

  it('does not signal past the end while a later section exists', async () => {
    const paginator = await openPaginator(2, 'scrolled', 0)
    const events = listen(host!)

    await paginator.next()

    expect(events).toEqual([])
    expect(paginator.sections[1]!.load).toHaveBeenCalled()
  })
})
