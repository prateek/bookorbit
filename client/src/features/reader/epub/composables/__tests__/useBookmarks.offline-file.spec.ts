import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalBookmark } from '@/features/offline/lib/offline-db'
import { useBookmarks } from '../useBookmarks'

const mocks = vi.hoisted(() => ({
  api: vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
  list: vi.fn<() => Promise<Partial<LocalBookmark>[]>>(),
}))
vi.mock('@/lib/api', () => ({ api: mocks.api }))
vi.mock('@/features/offline/composables/useBookReplica', () => ({
  attachBookReplica: async () => ({ session: { replica: { listBookmarks: mocks.list } }, detach: () => {} }),
}))
beforeEach(() => {
  mocks.api.mockReset()
  mocks.list.mockResolvedValue([
    { id: 1, serverId: 1, bookId: 7, bookFileId: 10, cfi: 'source-cfi', title: 'Local title', note: 'Local edit' },
    { id: -2, serverId: null, bookId: 7, bookFileId: 20, cfi: 'pending-cfi', title: 'Offline bookmark' },
  ])
})
describe('offline bookmarks in different editions', () => {
  it('uses server-projected positions without replacing queued local edits', async () => {
    mocks.api.mockResolvedValue(Response.json([{ id: 1, cfi: 'target-cfi', title: 'Old title', note: null }]))
    const store = useBookmarks()
    await store.load(7, 20)
    expect(store.bookmarks.value).toEqual([
      expect.objectContaining({ id: 1, cfi: 'target-cfi', title: 'Local title', note: 'Local edit' }),
      expect.objectContaining({ id: -2, cfi: 'pending-cfi' }),
    ])
  })
  it('does not navigate using another edition position when the server cannot project it', async () => {
    mocks.api.mockRejectedValue(new Error('offline'))
    const store = useBookmarks()
    await store.load(7, 20)
    expect(store.bookmarks.value.map(({ cfi }) => cfi)).toEqual([null, 'pending-cfi'])
  })
})
