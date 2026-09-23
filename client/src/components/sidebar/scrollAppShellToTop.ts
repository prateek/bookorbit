const SHELL_SELECTOR = '.app-shell-scroll'

function isScrollContainer(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.scrollTop <= 0) return false
  const { overflowY } = getComputedStyle(el)
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
}

/**
 * Scrolls the app shell and any scrolled container inside it (views like the series grid scroll
 * their own <main>) back to the top. Returns how many containers were moved.
 */
export function scrollAppShellToTop(root: ParentNode = document): number {
  const shell = root.querySelector<HTMLElement>(SHELL_SELECTOR)
  if (!shell) return 0
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  // 'instant' rather than 'auto': the shell sets scroll-behavior: smooth in CSS.
  const behavior: ScrollBehavior = reduceMotion ? 'instant' : 'smooth'
  const targets = [shell, ...shell.querySelectorAll('*')].filter(isScrollContainer)
  for (const el of targets) el.scrollTo({ top: 0, behavior })
  return targets.length
}
