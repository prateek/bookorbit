const PHONE_MAX_WIDTH = 600
const PHONE_MIN_SIDE_MARGIN = 20

function currentViewportWidth(): number | undefined {
  return typeof window === 'undefined' ? undefined : window.innerWidth
}

/**
 * The side margin setting is a fraction of the reader's width, and foliate turns it into
 * `gap * width` of padding on each side in both flows. On a phone a low setting leaves the
 * text against the screen edge, so the fraction sent to the renderer is raised to keep at
 * least 20px a side. The stored setting is left as the reader chose it.
 */
export function phoneSafeGap(gap: number, viewportWidth = currentViewportWidth()): number {
  if (!viewportWidth || viewportWidth >= PHONE_MAX_WIDTH) return gap
  return Math.max(gap, PHONE_MIN_SIDE_MARGIN / viewportWidth)
}
