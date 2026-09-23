import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { waitForReachableSession } from '../lib/session-unavailable'

const labels = { title: 'Offline', message: 'Cannot reach the server', retry: 'Try again', retrying: 'Trying again...' }

function mountContainer() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('waitForReachableSession', () => {
  it('keeps the retry screen up until the server answers, then clears it', async () => {
    const container = mountContainer()
    const checkSession = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    let resolved = false
    void waitForReachableSession({ container, labels, checkSession }).then(() => {
      resolved = true
    })

    expect(container.textContent).toContain('Cannot reach the server')
    const button = container.querySelector('button')!

    button.click()
    await flushPromises()
    expect(resolved).toBe(false)
    expect(container.textContent).toContain('Try again')

    button.click()
    await flushPromises()
    expect(resolved).toBe(true)
    expect(container.textContent).toBe('')
    expect(checkSession).toHaveBeenCalledTimes(2)
  })

  it('retries on its own when the device comes back online', async () => {
    const container = mountContainer()
    const checkSession = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    const done = waitForReachableSession({ container, labels, checkSession })

    window.dispatchEvent(new Event('online'))

    await expect(done).resolves.toBeUndefined()
    expect(checkSession).toHaveBeenCalledTimes(1)
  })
})
