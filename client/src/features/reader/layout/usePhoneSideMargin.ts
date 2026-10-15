import { useEventListener } from '@vueuse/core'
import { phoneSafeGap } from './phone-side-margin'

/**
 * Foliate re-renders on resize with the gap it was last given, so a floor worked out for one
 * width would outlive a rotation. Re-applies the layout whenever the floored gap differs at
 * the new width.
 */
export function usePhoneSideMarginRefresh(gap: () => number, reapplyLayout: () => void): void {
  if (typeof window === 'undefined') return
  let lastWidth = window.innerWidth
  useEventListener(window, 'resize', () => {
    const width = window.innerWidth
    const changed = phoneSafeGap(gap(), width) !== phoneSafeGap(gap(), lastWidth)
    lastWidth = width
    if (changed) reapplyLayout()
  })
}
