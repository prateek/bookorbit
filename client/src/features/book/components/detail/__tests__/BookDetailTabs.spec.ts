import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BookDetailTabs from '../BookDetailTabs.vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn<(to: unknown) => Promise<void>>(),
  replace: vi.fn<(to: unknown) => Promise<void>>(),
  canEdit: true,
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ query: { tab: 'details' } }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))

vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => mocks.canEdit }),
}))

describe('BookDetailTabs', () => {
  beforeEach(() => {
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.canEdit = true
  })

  it('puts the reading tabs ahead of the librarian ones', () => {
    const wrapper = mount(BookDetailTabs, { props: { bookId: 4329 } })

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Details', 'Reading Log', 'Highlights', 'Files', 'Edit Metadata'])
    expect(wrapper.get('[aria-current="page"]').text()).toBe('Details')
  })

  it('switches tabs without adding a history entry', async () => {
    const wrapper = mount(BookDetailTabs, { props: { bookId: 4329 } })

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(mocks.replace).toHaveBeenCalledWith({ name: 'book-detail', params: { bookId: 4329 }, query: { tab: 'reading-log' } })
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
