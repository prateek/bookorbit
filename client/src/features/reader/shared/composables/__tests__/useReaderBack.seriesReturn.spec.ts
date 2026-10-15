import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createRouter, createWebHistory, RouterView, useRoute, type Router } from 'vue-router'
import { isReturningToHistoryEntry } from '@/features/book/composables/useScrollRestoreOnActivate'
import { rememberDocumentStart } from '../../lib/document-history'
import { useReaderBack } from '../useReaderBack'

type Back = ReturnType<typeof useReaderBack>

const seriesOf: Record<number, number | null> = { 5: 5, 6: 5, 7: 9, 8: null }
let reader: Back | null = null

const Reader = defineComponent({
  setup() {
    const bookId = Number(useRoute().params.bookId)
    reader = useReaderBack(bookId, () => ({ seriesId: seriesOf[bookId] ?? null, seriesMemberships: [] }))
    return () => h('div')
  },
})

const Page = defineComponent({ render: () => h('div') })
const routers: Router[] = []
const wrappers: VueWrapper[] = []

async function openApp(path: string): Promise<Router> {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: Page },
      { path: '/books/:bookId', name: 'book-detail', component: Page },
      { path: '/series/:seriesId', name: 'series-detail', component: Page },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Reader },
    ],
  })
  routers.push(router)
  await router.push(path)
  rememberDocumentStart()
  const Shell = defineComponent({
    render: () =>
      h(RouterView, null, {
        default: ({ Component, route }: { Component: unknown; route: { path: string } }) => h(Component as typeof Page, { key: route.path }),
      }),
  })
  wrappers.push(mount(Shell, { global: { plugins: [router] } }))
  return router
}

function navigated(router: Router, step: () => void): Promise<void> {
  return new Promise((done) => {
    const stop = router.afterEach(() => {
      stop()
      done()
    })
    step()
  })
}

/** Opens `book` in the reader from the current page, then moves on to `next` the way Next does. */
async function readThenMoveOn(router: Router, book: number, next: number) {
  await router.push(`/read/${book}/${book}0`)
  await router.replace({ path: `/read/${next}/${next}0`, state: reader!.handoffState() })
}

function historyState() {
  return window.history.state as { back: string | null; forward: string | null; position: number }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  reader = null
})

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  for (const router of routers.splice(0)) router.options.history.destroy()
})

describe('Back from a later chapter of the series the reader was opened from', () => {
  it('returns to that series page and lands it on the current chapter, keeping one series entry', async () => {
    const router = await openApp('/')
    await router.push('/series/5')
    const seriesPosition = historyState().position
    await readThenMoveOn(router, 5, 6)

    await navigated(router, () => reader!.goBack())

    expect(router.currentRoute.value.fullPath).toBe('/series/5?book=6')
    expect(historyState().position).toBe(seriesPosition)
    expect(historyState().back).toBe('/')
  })

  it('lands like a new visit, so the series page jumps to the chapter instead of restoring its old scroll', async () => {
    const router = await openApp('/')
    await router.push('/series/5')
    await readThenMoveOn(router, 5, 6)

    await navigated(router, () => reader!.goBack())

    expect(isReturningToHistoryEntry()).toBe(false)
  })

  it('leaves later navigation to the series page alone', async () => {
    const router = await openApp('/')
    await router.push('/series/5')
    await readThenMoveOn(router, 5, 6)
    await navigated(router, () => reader!.goBack())

    await router.push('/')
    await navigated(router, () => router.back())

    expect(router.currentRoute.value.fullPath).toBe('/series/5?book=6')
  })
})

describe('Back from a later chapter after the reader page reloaded', () => {
  it('replaces the reader with the series row, since going back would load the old series page afresh', async () => {
    const router = await openApp('/')
    await router.push('/series/5')
    await readThenMoveOn(router, 5, 6)
    const readerPosition = historyState().position
    rememberDocumentStart()

    await navigated(router, () => reader!.goBack())

    expect(router.currentRoute.value.fullPath).toBe('/series/5?book=6')
    expect(historyState().position).toBe(readerPosition)
  })

  it('still goes back when the reload happened on the series page before the reader opened', async () => {
    const router = await openApp('/')
    await router.push('/series/5')
    const seriesPosition = historyState().position
    rememberDocumentStart()
    await readThenMoveOn(router, 5, 6)

    await navigated(router, () => reader!.goBack())

    expect(router.currentRoute.value.fullPath).toBe('/series/5?book=6')
    expect(historyState().position).toBe(seriesPosition)
  })
})

describe('Back from a later chapter when the page behind is not its series page', () => {
  it('replaces the reader with the series row when the reader was opened from elsewhere', async () => {
    const router = await openApp('/')
    const readerPosition = historyState().position + 1
    await readThenMoveOn(router, 5, 6)

    await navigated(router, () => reader!.goBack())

    expect(router.currentRoute.value.fullPath).toBe('/series/5?book=6')
    expect(historyState().position).toBe(readerPosition)
  })

  it("replaces the reader when the page behind is another series' page", async () => {
    const router = await openApp('/series/5')
    const readerPosition = historyState().position + 1
    await readThenMoveOn(router, 5, 7)

    await navigated(router, () => reader!.goBack())

    expect(router.currentRoute.value.fullPath).toBe('/series/9?book=7')
    expect(historyState().position).toBe(readerPosition)
  })

  it('opens the book page for a chapter outside any series', async () => {
    const router = await openApp('/series/5')
    await readThenMoveOn(router, 5, 8)

    await navigated(router, () => reader!.goBack())

    expect(router.currentRoute.value.fullPath).toBe('/books/8')
  })
})
