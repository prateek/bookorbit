import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scrollAppShellToTop } from '../scrollAppShellToTop'

function scroller(scrollTop: number, overflowY = 'auto') {
  const el = document.createElement('div')
  el.style.overflowY = overflowY
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true })
  el.scrollTo = vi.fn<(options?: ScrollToOptions) => void>() as unknown as HTMLElement['scrollTo']
  return el
}

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches })),
  )
}

describe('scrollAppShellToTop', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement('div')
    document.body.append(root)
    mockReducedMotion(false)
  })

  afterEach(() => {
    root.remove()
    vi.unstubAllGlobals()
  })

  it('smoothly scrolls the shell and a scrolled inner main to the top', () => {
    const shell = scroller(300)
    shell.className = 'app-shell-scroll'
    const main = scroller(1200)
    const unscrolled = scroller(0)
    const hidden = scroller(50, 'hidden')
    shell.append(main, unscrolled, hidden)
    root.append(shell)

    expect(scrollAppShellToTop(root)).toBe(2)
    expect(shell.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(main.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(unscrolled.scrollTo).not.toHaveBeenCalled()
    expect(hidden.scrollTo).not.toHaveBeenCalled()
  })

  it('jumps instantly when the user prefers reduced motion', () => {
    mockReducedMotion(true)
    const shell = scroller(300)
    shell.className = 'app-shell-scroll'
    root.append(shell)

    scrollAppShellToTop(root)

    expect(shell.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('does nothing when everything is already at the top', () => {
    const shell = scroller(0)
    shell.className = 'app-shell-scroll'
    root.append(shell)

    expect(scrollAppShellToTop(root)).toBe(0)
    expect(shell.scrollTo).not.toHaveBeenCalled()
  })

  it('does nothing outside the app shell', () => {
    expect(scrollAppShellToTop(root)).toBe(0)
  })
})
