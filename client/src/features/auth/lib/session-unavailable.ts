import { createApp, h, ref } from 'vue'
import SessionUnavailableScreen from '../SessionUnavailableScreen.vue'

export interface SessionUnavailableLabels {
  title: string
  message: string
  retry: string
  retrying: string
}

/**
 * Shows a retry screen in `container` until `checkSession` reports the server answered, then
 * removes it. The URL is left alone, so the app mounted afterwards still opens what was requested.
 */
export function waitForReachableSession(options: {
  container: string | Element
  labels: SessionUnavailableLabels
  checkSession: () => Promise<boolean>
}): Promise<void> {
  return new Promise((resolve) => {
    const retrying = ref(false)

    const screen = createApp({
      render: () =>
        h(SessionUnavailableScreen, {
          title: options.labels.title,
          message: options.labels.message,
          retryLabel: retrying.value ? options.labels.retrying : options.labels.retry,
          retrying: retrying.value,
          onRetry: retry,
        }),
    })

    async function retry() {
      if (retrying.value) return
      retrying.value = true
      let reachable = false
      try {
        reachable = await options.checkSession()
      } catch {
        reachable = false
      } finally {
        retrying.value = false
      }
      if (!reachable) return
      window.removeEventListener('online', retry)
      screen.unmount()
      resolve()
    }

    window.addEventListener('online', retry)
    screen.mount(options.container)
  })
}
