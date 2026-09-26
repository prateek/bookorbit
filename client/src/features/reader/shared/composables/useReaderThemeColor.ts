import { onUnmounted, watch } from 'vue'

function toSrgb(color: string): string | null {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return color
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  return a ? `rgb(${r}, ${g}, ${b})` : null
}

function syncThemeColorToBody() {
  const color = toSrgb(getComputedStyle(document.body).backgroundColor)
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
}

/**
 * Paints the browser chrome around the reader (the iOS status bar of a Home Screen app, the
 * overscroll area) in the page color instead of the app theme. The app derives `theme-color` from
 * the body background, so the reader sets the body background and re-derives from it on close,
 * which also picks up an app theme change made while reading. A null color leaves the app's colors.
 */
export function useReaderThemeColor(pageColor: () => string | null) {
  const previousBody = document.body.style.backgroundColor

  watch(
    pageColor,
    (color) => {
      document.body.style.backgroundColor = color ?? previousBody
      syncThemeColorToBody()
    },
    { immediate: true },
  )

  onUnmounted(() => {
    document.body.style.backgroundColor = previousBody
    syncThemeColorToBody()
  })
}
