import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushProgressBeforeNavigation } from '../bounded-progress-flush'

afterEach(() => vi.useRealTimers())

describe('progress before navigation', () => {
  it('lets navigation finish when the save stalls and leaves the save running', async () => {
    vi.useFakeTimers()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/read/:book/:file', component: {} },
        { path: '/library', component: {} },
      ],
    })
    await router.push('/read/1/10')
    let complete!: () => void
    let saved = false
    const pending = new Promise<void>((resolve) => {
      complete = resolve
    }).then(() => {
      saved = true
    })
    router.beforeEach(() => flushProgressBeforeNavigation(() => pending))
    const navigation = router.push('/library')
    await vi.advanceTimersByTimeAsync(749)
    expect(router.currentRoute.value.path).toBe('/read/1/10')
    await vi.advanceTimersByTimeAsync(1)
    await navigation
    expect(router.currentRoute.value.path).toBe('/library')
    expect(saved).toBe(false)
    complete()
    await pending
    expect(saved).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits for a quick local save and does not let a save error block navigation', async () => {
    vi.useFakeTimers()
    let complete!: () => void
    const pending = new Promise<void>((resolve) => {
      complete = resolve
    })
    const done = flushProgressBeforeNavigation(() => pending)
    complete()
    await done
    expect(vi.getTimerCount()).toBe(0)
    await expect(flushProgressBeforeNavigation(() => Promise.reject(new Error('Storage refused write')))).resolves.toBeUndefined()
  })
})
