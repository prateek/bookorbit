import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, onUnmounted } from 'vue'
import { createMemoryHistory, createRouter, RouterView, useRoute } from 'vue-router'
import type { ReadStatus } from '@bookorbit/types'
import { READ_STATUS_WAIT_MS, readerModeOf, trackedReadingQuery, useReaderTracking, type ReaderMode } from '../useReaderTracking'

function setup(initialMode: ReaderMode = null) {
  return { tracking: useReaderTracking(initialMode) }
}

describe('readerModeOf', () => {
  it('reads the first mode value and ignores unknown ones', () => {
    expect(readerModeOf('peek')).toBe('peek')
    expect(readerModeOf(['reread', 'peek'])).toBe('reread')
    expect(readerModeOf('read')).toBeNull()
    expect(readerModeOf(undefined)).toBeNull()
  })
})

describe('trackedReadingQuery', () => {
  it("uses the reader shell's rule when one is given", () => {
    const { tracking } = setup()
    tracking.resolve('read')

    expect(trackedReadingQuery({ format: 'cbz' }, tracking.startTracking)).toEqual({ format: 'cbz', mode: 'reread' })
  })

  it('only drops the mode without one', () => {
    expect(trackedReadingQuery({ format: 'cbz', mode: 'peek' })).toEqual({ format: 'cbz' })
  })
})

describe('useReaderTracking', () => {
  it('tracks nothing until the read status is known', () => {
    const { tracking } = setup()

    expect(tracking.trackingEnabled.value).toBe(false)
    expect(tracking.peeking.value).toBe(false)
  })

  it('reports when the decision is made, including when the status is unavailable', () => {
    const { tracking } = setup()
    expect(tracking.resolved.value).toBe(false)

    tracking.resolve(null)

    expect(tracking.resolved.value).toBe(true)
    expect(tracking.trackingEnabled.value).toBe(true)
  })

  it.each<[ReaderMode, ReadStatus | null, boolean, boolean]>([
    [null, 'unread', true, false],
    [null, 'reading', true, false],
    [null, 'rereading', true, false],
    [null, null, true, false],
    [null, 'read', false, true],
    ['reread', 'read', true, false],
    ['reread', 'unread', true, false],
    ['peek', 'unread', false, true],
    ['peek', 'read', false, true],
  ])('mode %s with status %s: tracking %s, peeking %s', (mode, status, tracked, peeking) => {
    const { tracking } = setup(mode)

    tracking.resolve(status)

    expect(tracking.trackingEnabled.value).toBe(tracked)
    expect(tracking.peeking.value).toBe(peeking)
  })

  it('shows the peek badge before the status is known only for an explicit peek', () => {
    expect(setup('peek').tracking.peeking.value).toBe(true)
    expect(setup('reread').tracking.peeking.value).toBe(false)
  })

  it('keeps tracking on when the chapter is marked read mid-session', () => {
    const { tracking } = setup()

    tracking.resolve('reading')
    tracking.resolve('read')

    expect(tracking.trackingEnabled.value).toBe(true)
  })

  it('starts tracking when Start reading switches a finished book to a reread', () => {
    const { tracking } = setup()
    tracking.resolve('read')

    const query = tracking.startTracking({ format: 'epub' })

    expect(query).toEqual({ format: 'epub', mode: 'reread' })
    expect(tracking.trackingEnabled.value).toBe(true)
    expect(tracking.peeking.value).toBe(false)
  })

  it('drops an explicit peek for a book that is not finished', () => {
    const { tracking } = setup('peek')
    tracking.resolve('reading')

    expect(tracking.startTracking({ format: 'epub', mode: 'peek' })).toEqual({ format: 'epub' })
    expect(tracking.trackingEnabled.value).toBe(true)
  })

  it('keeps tracking a reread while the reader unmounts after leaving it', async () => {
    const seen: { phase: string; routeMode: unknown; tracking: boolean }[] = []
    const Reader = defineComponent({
      setup() {
        const route = useRoute()
        const tracking = useReaderTracking(readerModeOf(route.query.mode))
        tracking.resolve('read')
        seen.push({ phase: 'mounted', routeMode: route.query.mode, tracking: tracking.trackingEnabled.value })
        onUnmounted(() => seen.push({ phase: 'unmounted', routeMode: route.query.mode, tracking: tracking.trackingEnabled.value }))
        return () => h('div')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/series/:id', component: { render: () => h('div') } },
        { path: '/read/:bookId/:fileId', component: Reader },
      ],
    })
    await router.push('/series/1')
    await router.push('/read/5/6?mode=reread')
    const wrapper = mount(RouterView, { global: { plugins: [router] } })

    await router.push('/series/1')
    await wrapper.vm.$nextTick()

    expect(seen).toEqual([
      { phase: 'mounted', routeMode: 'reread', tracking: true },
      { phase: 'unmounted', routeMode: undefined, tracking: true },
    ])
  })

  it('lets the reader wait for the decision before loading a saved position', async () => {
    const { tracking } = setup()
    let settled = false
    void tracking.whenResolved().then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    tracking.resolve('read')
    await tracking.whenResolved()
    expect(settled).toBe(true)
  })
})

describe('useReaderTracking resolveFrom', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function pending<T>() {
    let settle!: (value: T) => void
    let fail!: (reason: unknown) => void
    const promise = new Promise<T>((resolve, reject) => {
      settle = resolve
      fail = reject
    })
    return { promise, settle, fail }
  }

  it('uses the status the request returns in time', async () => {
    vi.useFakeTimers()
    const { tracking } = setup()
    const status = pending<ReadStatus>()

    tracking.resolveFrom(status.promise)
    status.settle('read')
    await vi.advanceTimersByTimeAsync(0)

    expect(tracking.resolved.value).toBe(true)
    expect(tracking.peeking.value).toBe(true)
    expect(tracking.trackingEnabled.value).toBe(false)
  })

  it('tracks as before when the request fails', async () => {
    vi.useFakeTimers()
    const { tracking } = setup()
    const status = pending<ReadStatus>()

    tracking.resolveFrom(status.promise)
    status.fail(new Error('offline'))
    await vi.advanceTimersByTimeAsync(0)

    expect(tracking.resolved.value).toBe(true)
    expect(tracking.trackingEnabled.value).toBe(true)
  })

  it('stops waiting for a stalled request and ignores its late answer', async () => {
    vi.useFakeTimers()
    const { tracking } = setup()
    const status = pending<ReadStatus>()

    tracking.resolveFrom(status.promise)
    await vi.advanceTimersByTimeAsync(READ_STATUS_WAIT_MS - 1)
    expect(tracking.resolved.value).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(tracking.resolved.value).toBe(true)
    expect(tracking.trackingEnabled.value).toBe(true)

    status.settle('read')
    await vi.advanceTimersByTimeAsync(0)
    expect(tracking.peeking.value).toBe(false)
    expect(tracking.trackingEnabled.value).toBe(true)
  })
})
