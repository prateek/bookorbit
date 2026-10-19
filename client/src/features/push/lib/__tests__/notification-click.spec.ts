// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

class Channel {
  port1 = { onmessage: null as null | ((event: { data: unknown }) => void), close: vi.fn<() => void>() }
  port2 = { postMessage: (data: unknown) => this.port1.onmessage?.({ data }) }
}

function client(standalone: boolean) {
  return {
    url: 'https://books.test/read/1/10',
    focus: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    navigate: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
    postMessage: vi.fn<
      (data: { type: string; url?: string }, ports: Array<{ postMessage: (data: { standalone?: boolean; accepted?: boolean }) => void }>) => void
    >((data, ports) => ports[0].postMessage(data.type === 'BOOKORBIT_NOTIFICATION_PROBE' ? { standalone } : { accepted: true })),
  }
}

async function click(windows: ReturnType<typeof client>[], target = '/new-arrivals/batch') {
  const handlers: Record<string, (event: unknown) => void> = {}
  const openWindow = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined)
  const close = vi.fn<() => void>()
  const worker = {
    location: { origin: 'https://books.test' },
    navigator: {},
    clients: { matchAll: vi.fn<() => Promise<ReturnType<typeof client>[]>>().mockResolvedValue(windows), openWindow },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers[type] = handler
    },
  }
  runInNewContext(readFileSync(new URL('../../../../../public/push-sw.js', import.meta.url), 'utf8'), {
    self: worker,
    URL,
    MessageChannel: Channel,
    setTimeout,
    clearTimeout,
  })
  let done!: Promise<void>
  handlers.notificationclick({
    notification: { close, data: { url: target } },
    waitUntil: (promise: Promise<void>) => {
      done = promise
    },
  })
  await done
  return { openWindow, close }
}

describe('service worker notification clicks', () => {
  it('prefers a running PWA over a browser tab and hands off without a reload', async () => {
    const browser = client(false)
    const app = client(true)
    const { openWindow, close } = await click([browser, app])
    expect(close).toHaveBeenCalledOnce()
    expect(app.focus).toHaveBeenCalledOnce()
    expect(app.navigate).not.toHaveBeenCalled()
    expect(browser.focus).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
    expect(app.postMessage.mock.calls[1][0].url).toBe('https://books.test/new-arrivals/batch')
  })

  it('opens a destination when the PWA is closed, leaving browser tabs alone', async () => {
    const browser = client(false)
    const { openWindow } = await click([browser])
    expect(openWindow).toHaveBeenCalledWith('https://books.test/new-arrivals/batch')
    expect(browser.navigate).not.toHaveBeenCalled()
  })

  it('falls back to opening the target when focus fails', async () => {
    const app = client(true)
    app.focus.mockRejectedValue(new Error('Cannot focus'))
    expect((await click([app], '/read/2/20?format=epub')).openWindow).toHaveBeenCalledWith('https://books.test/read/2/20?format=epub')
  })

  it('falls back to normal navigation if the handoff is declined', async () => {
    const app = client(true)
    app.postMessage.mockImplementation((data, ports) =>
      ports[0].postMessage(data.type === 'BOOKORBIT_NOTIFICATION_PROBE' ? { standalone: true } : { accepted: false }),
    )
    await click([app])
    expect(app.navigate).toHaveBeenCalledWith('https://books.test/new-arrivals/batch')
  })
  it('opens the target without hijacking an unresponsive window', async () => {
    vi.useFakeTimers()
    try {
      const app = client(true)
      app.postMessage.mockImplementation(() => {})
      const done = click([app])
      await vi.advanceTimersByTimeAsync(2000)
      const { openWindow } = await done
      expect(app.navigate).not.toHaveBeenCalled()
      expect(openWindow).toHaveBeenCalledWith('https://books.test/new-arrivals/batch')
    } finally {
      vi.useRealTimers()
    }
  })
})

it('focuses a responding PWA without waiting for a frozen tab to time out', async () => {
  vi.useFakeTimers()
  try {
    const frozen = client(false)
    frozen.postMessage.mockImplementation(() => {})
    const app = client(true)
    await click([frozen, app])
    expect(app.focus).toHaveBeenCalledOnce()
    expect(frozen.focus).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
  } finally {
    vi.useRealTimers()
  }
})
