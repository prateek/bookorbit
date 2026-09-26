import { onUnmounted, watch } from 'vue'

/**
 * Paints the browser chrome around the reader (the iOS status bar of a Home Screen app, the
 * overscroll area) in the page color instead of the app theme. The app derives `theme-color` from
 * the body background, so both follow the page while the reader is open and are restored after.
 */
export function useReaderThemeColor(pageColor: () => string) {
  const meta = document.querySelector('meta[name="theme-color"]')
  const previousMeta = meta?.getAttribute('content') ?? null
  const previousBody = document.body.style.backgroundColor

  watch(
    pageColor,
    (color) => {
      document.body.style.backgroundColor = color
      meta?.setAttribute('content', color)
    },
    { immediate: true },
  )

  onUnmounted(() => {
    document.body.style.backgroundColor = previousBody
    if (previousMeta !== null) meta?.setAttribute('content', previousMeta)
  })
}
