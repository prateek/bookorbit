import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import BookDetailHeader from '../BookDetailHeader.vue'
import { setBookDetailBackTarget } from '../book-detail-back-target'

const mocks = vi.hoisted(() => ({
  push: vi.fn<(to: unknown) => Promise<void>>(),
  back: vi.fn<() => void>(),
  historyState: { back: null as string | null },
  hasContext: { value: false },
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({
    push: mocks.push,
    back: mocks.back,
    options: { history: { state: mocks.historyState } },
  }),
}))

vi.mock('../../../composables/useBookNavigation', async () => {
  const { computed, ref } = await import('vue')
  const ids = ref([1, 2, 3])
  return {
    useBookNavigation: () => ({
      bookIds: ids,
      getNextId: async (id: number) => (id < 3 ? id + 1 : null),
      getPrevId: (id: number) => (id > 1 ? id - 1 : null),
      hasContext: computed(() => mocks.hasContext.value),
      currentIndex: (id: number) => id - 1,
      total: computed(() => 3),
    }),
  }
})

function mountHeader(bookId = 2) {
  return shallowMount(BookDetailHeader, { props: { bookId } })
}

describe('BookDetailHeader', () => {
  beforeEach(() => {
    mocks.push.mockReset()
    mocks.push.mockResolvedValue(undefined)
    mocks.back.mockReset()
    mocks.historyState.back = null
    mocks.hasContext.value = false
    setBookDetailBackTarget({ bookId: 0, seriesId: null, libraryId: null })
  })

  it('goes back through in-app history when there is some', async () => {
    mocks.historyState.back = '/series/20'
    const wrapper = mountHeader()

    await wrapper.get('[data-test="book-detail-back"]').trigger('click')

    expect(mocks.back).toHaveBeenCalledTimes(1)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('falls back to the series page on a fresh landing', async () => {
    setBookDetailBackTarget({ bookId: 2, seriesId: 20, libraryId: 4 })
    const wrapper = mountHeader()

    await wrapper.get('[data-test="book-detail-back"]').trigger('click')

    expect(mocks.push).toHaveBeenCalledWith({ name: 'series-detail', params: { seriesId: 20 } })
  })

  it('falls back to the library, then the dashboard, when no series is known', async () => {
    setBookDetailBackTarget({ bookId: 2, seriesId: null, libraryId: 4 })
    const wrapper = mountHeader()
    await wrapper.get('[data-test="book-detail-back"]').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'library', params: { id: 4 } })

    setBookDetailBackTarget({ bookId: 99, seriesId: 20, libraryId: 4 })
    await wrapper.get('[data-test="book-detail-back"]').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'dashboard' })
  })

  it('shows previous and next controls on phones with 44px targets', async () => {
    mocks.hasContext.value = true
    const wrapper = mountHeader()
    await flushPromises()

    const nav = wrapper.get('[data-test="book-detail-context-nav"]')
    expect(nav.classes()).not.toContain('hidden')
    const buttons = nav.findAll('button')
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button.classes()).toEqual(expect.arrayContaining(['h-11', 'w-11']))
    }

    await buttons[1]!.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ name: 'book-detail', params: { bookId: 3 }, query: {} })
  })
})
