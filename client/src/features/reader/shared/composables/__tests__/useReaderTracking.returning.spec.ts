import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createRouter, createWebHistory, RouterView, useRoute, type Router } from 'vue-router'
import type { ReadStatus } from '@bookorbit/types'
import { installPwaResume } from '@/features/pwa/lib/app-resume'

const apiMock = vi.hoisted(() => vi.fn<(input: string, init?: RequestInit) => Promise<Response>>())

vi.mock('@/lib/api', () => ({ api: apiMock }))
vi.mock('@/features/offline/offline-session', () => ({
  currentOfflineSession: () => null,
  whenOfflineSession: async () => null,
}))

import { isTrackedReaderEntry, markTrackedReaderEntry } from '../../lib/reader-entry'
import { useReaderProgress } from '../useReaderProgress'
import { readerModeOf, useReaderTracking } from '../useReaderTracking'

const SAVED_CFI = 'epubcfi(/6/40!/4/2/1:0)'

type Opened = { tracking: ReturnType<typeof useReaderTracking>; progress: ReturnType<typeof useReaderProgress> }

let status: ReadStatus = 'read'
let opened: Promise<Opened> | null = null

/** Opens a reader the way ReaderView does: tracking decision for its entry, then the progress load. */
const Reader = defineComponent({
  setup() {
    const route = useRoute()
    const tracking = useReaderTracking(readerModeOf(route.query.mode), { entryPath: route.path })
    const progress = useReaderProgress(Number(route.params.bookId), Number(route.params.fileId), ref(0), 0, {
      trackingEnabled: tracking.trackingEnabled,
      loadsPosition: tracking.loadsPosition,
    })
    tracking.resolve(status)
    opened = tracking
      .whenResolved()
      .then(() => progress.load())
      .then(() => ({ tracking, progress }))
    return () => h('div')
  },
})

const Page = defineComponent({ render: () => h('div') })
const routers: Router[] = []
const uninstalls: (() => void)[] = []
const wrappers: VueWrapper[] = []

function createApp() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: Page },
      { path: '/series/:seriesId', name: 'series-detail', component: Page },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Reader },
    ],
  })
  routers.push(router)
  return router
}

async function mountApp(router: Router, path: string) {
  await router.push(path)
  // Like the app shell, a different chapter mounts a new reader.
  const Shell = defineComponent({
    render: () =>
      h(RouterView, null, {
        default: ({ Component, route }: { Component: unknown; route: { path: string } }) => h(Component as typeof Page, { key: route.path }),
      }),
  })
  wrappers.push(mount(Shell, { global: { plugins: [router] } }))
}

async function readerOpened(): Promise<Opened> {
  const result = await opened!
  opened = null
  return result
}

function traverse(router: Router, step: () => void): Promise<void> {
  return new Promise((done) => {
    const stop = router.afterEach(() => {
      stop()
      done()
    })
    step()
  })
}

function progressRequests(method: 'GET' | 'POST') {
  return apiMock.mock.calls.filter(([url, init]) => url.endsWith('/progress') && (init?.method ?? 'GET') === method)
}

beforeEach(() => {
  status = 'read'
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  apiMock.mockReset()
  apiMock.mockImplementation(async (_url, init) =>
    init?.method === 'POST'
      ? new Response(null, { status: 200 })
      : new Response(JSON.stringify({ percentage: 99, cfi: SAVED_CFI, lastReadAt: '2026-10-14T20:00:00.000Z' }), { status: 200 }),
  )
})

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  for (const uninstall of uninstalls.splice(0)) uninstall()
  for (const router of routers.splice(0)) router.options.history.destroy()
  opened = null
  vi.unstubAllGlobals()
})

describe('reopening a finished chapter', () => {
  it('opens a finished chapter fresh at the start, untracked', async () => {
    await mountApp(createApp(), '/read/5/7?format=epub')
    const { tracking, progress } = await readerOpened()

    expect(tracking.trackingEnabled.value).toBe(false)
    expect(tracking.peeking.value).toBe(true)
    expect(progressRequests('GET')).toHaveLength(0)
    expect(progress.cfi.value).toBeNull()
  })

  it('reopens a chapter finished while reading where the reader left it after going back, still untracked', async () => {
    status = 'reading'
    const router = createApp()
    await mountApp(router, '/read/5/7?format=epub')
    await readerOpened()
    status = 'read'
    await router.push('/series/2')

    await traverse(router, () => router.back())
    const { tracking, progress } = await readerOpened()

    expect(router.currentRoute.value.path).toBe('/read/5/7')
    expect(progressRequests('GET')).toHaveLength(2)
    expect(progress.cfi.value).toBe(SAVED_CFI)
    expect(progress.percentage.value).toBe(99)
    expect(tracking.trackingEnabled.value).toBe(false)
    expect(tracking.peeking.value).toBe(true)

    const postsBefore = progressRequests('POST').length
    progress.onRelocate({ cfi: 'epubcfi(/6/42)', fraction: 1 })
    await progress.flush()
    expect(progressRequests('POST')).toHaveLength(postsBefore)
  })

  it('opens a peeked finished chapter at the start again after going back to it', async () => {
    const router = createApp()
    await mountApp(router, '/read/5/7?format=epub')
    const peek = await readerOpened()
    peek.progress.onRelocate({ cfi: 'epubcfi(/6/4)', fraction: 0.02 })
    await router.push('/series/2')

    await traverse(router, () => router.back())
    const { tracking, progress } = await readerOpened()

    expect(router.currentRoute.value.path).toBe('/read/5/7')
    expect(progressRequests('GET')).toHaveLength(0)
    expect(progress.cfi.value).toBeNull()
    expect(tracking.peeking.value).toBe(true)
  })

  it('reopens where the reader left it after a reload of the reader entry', async () => {
    status = 'reading'
    const first = createApp()
    await mountApp(first, '/read/5/7?format=epub')
    await readerOpened()
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    status = 'read'

    await mountApp(createApp(), '/read/5/7?format=epub')
    const { progress } = await readerOpened()

    expect(progress.cfi.value).toBe(SAVED_CFI)
  })

  it('reopens where the reader left it when the app resumes a chapter finished while reading', async () => {
    vi.stubGlobal('navigator', { standalone: true })
    status = 'reading'
    const before = createApp()
    uninstalls.push(installPwaResume(before, ref({ id: 1 })))
    await mountApp(before, '/read/5/7?format=epub')
    await readerOpened()
    window.dispatchEvent(new Event('pagehide'))
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    uninstalls.splice(0).forEach((uninstall) => uninstall())
    window.history.replaceState(null, '', '/')

    status = 'read'
    const router = createApp()
    uninstalls.push(installPwaResume(router, ref({ id: 1 })))
    await mountApp(router, '/')
    const { tracking, progress } = await readerOpened()

    expect(router.currentRoute.value.fullPath).toBe('/read/5/7?format=epub')
    expect(progress.cfi.value).toBe(SAVED_CFI)
    expect(tracking.trackingEnabled.value).toBe(false)
  })

  it('opens a finished chapter at the start when the app resumes a peek of it', async () => {
    vi.stubGlobal('navigator', { standalone: true })
    const before = createApp()
    uninstalls.push(installPwaResume(before, ref({ id: 1 })))
    await mountApp(before, '/read/5/7?format=epub')
    await readerOpened()
    window.dispatchEvent(new Event('pagehide'))
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    uninstalls.splice(0).forEach((uninstall) => uninstall())
    window.history.replaceState(null, '', '/')

    const router = createApp()
    uninstalls.push(installPwaResume(router, ref({ id: 1 })))
    await mountApp(router, '/')
    const { progress } = await readerOpened()

    expect(router.currentRoute.value.fullPath).toBe('/read/5/7?format=epub')
    expect(progressRequests('GET')).toHaveLength(0)
    expect(progress.cfi.value).toBeNull()
  })

  it('opens the next finished chapter fresh even though it replaces the entry of one already tracked', async () => {
    status = 'reading'
    const router = createApp()
    await mountApp(router, '/read/5/7?format=epub')
    await readerOpened()

    status = 'read'
    await router.replace('/read/6/8?format=epub')
    const { tracking, progress } = await readerOpened()

    expect(progressRequests('GET')).toHaveLength(1)
    expect(progress.cfi.value).toBeNull()
    expect(tracking.peeking.value).toBe(true)
  })

  it('opens a finished chapter at the start when picked again after peeking another chapter in the same entry', async () => {
    status = 'reading'
    const router = createApp()
    await mountApp(router, '/read/5/7?format=epub')
    await readerOpened()
    status = 'read'
    await router.replace('/read/6/8?format=epub')
    await readerOpened()

    await router.replace('/read/5/7?format=epub')
    const { tracking, progress } = await readerOpened()

    expect(progressRequests('GET')).toHaveLength(1)
    expect(progress.cfi.value).toBeNull()
    expect(tracking.peeking.value).toBe(true)
    expect(isTrackedReaderEntry('/read/5/7')).toBe(false)
  })

  it('keeps an explicit preview from loading the saved position on the way back', async () => {
    const router = createApp()
    await mountApp(router, '/read/5/7?format=epub&mode=peek')
    await readerOpened()
    await router.push('/series/2')

    await traverse(router, () => router.back())
    await readerOpened()

    expect(progressRequests('GET')).toHaveLength(0)
  })

  it('tracks an unfinished chapter as before on the way back', async () => {
    status = 'reading'
    const router = createApp()
    await mountApp(router, '/read/5/7?format=epub')
    await readerOpened()
    await router.push('/series/2')

    await traverse(router, () => router.back())
    const { tracking, progress } = await readerOpened()

    expect(tracking.trackingEnabled.value).toBe(true)
    expect(progress.cfi.value).toBe(SAVED_CFI)
    expect(progressRequests('GET')).toHaveLength(2)
  })

  it('does not mark an entry that already shows another screen', () => {
    window.history.replaceState({ current: '/series/2' }, '', '/series/2')

    markTrackedReaderEntry('/read/5/7')

    expect(isTrackedReaderEntry('/read/5/7')).toBe(false)
  })
})
