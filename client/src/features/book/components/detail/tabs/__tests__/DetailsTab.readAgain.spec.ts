import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import type { BookDetail, ReadStatus } from '@bookorbit/types'

const mocks = vi.hoisted(() => ({
  push: vi.fn<(to: unknown) => void>(),
  api: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRouter: () => ({ push: mocks.push, back: vi.fn<() => void>() }) }
})

vi.mock('@/lib/api', () => ({ api: mocks.api, setOnAuthFailure: vi.fn<(callback: () => void) => void>() }))
vi.mock('@/features/auth/composables/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }))

const DetailsTab = (await import('../DetailsTab.vue')).default

function makeBook(status: ReadStatus | null, extraFiles: BookDetail['files'] = []): BookDetail {
  return {
    id: 12,
    libraryId: 3,
    libraryName: 'Serials',
    status: 'present',
    folderPath: '/books',
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    title: 'Chapter 4',
    subtitle: null,
    description: null,
    isbn10: null,
    isbn13: null,
    publisher: null,
    publishedDate: null,
    publishedYear: null,
    language: null,
    pageCount: null,
    seriesName: null,
    seriesIndex: null,
    rating: null,
    personalNote: null,
    personalNoteUpdatedAt: null,
    communityRatings: [],
    coverSource: 'extracted',
    coverMedia: ['ebook'],
    covers: { ebook: null, audio: null },
    coverVersion: 'legacy:2024-01-01T00:00:00.000Z',
    hardcoverEditionId: null,
    providerIds: {},
    authors: [{ id: 1, name: 'Author One', sortName: null }],
    genres: [],
    tags: [],
    files: [
      {
        id: 101,
        format: 'epub',
        role: 'primary',
        sizeBytes: 1234,
        absolutePath: '/books/chapter-4.epub',
        createdAt: '2026-01-01T00:00:00.000Z',
        filename: 'chapter-4.epub',
        durationSeconds: null,
      },
      ...extraFiles,
    ],
    lastWrittenAt: null,
    metadataScore: null,
    readStatus: status ? { status, source: 'manual', startedAt: null, finishedAt: null, updatedAt: '2026-01-02T00:00:00.000Z' } : null,
    audioMetadata: null,
    readAloudSync: {
      mode: 'auto',
      state: 'unavailable',
      unavailableReason: 'no_media_overlay_epub',
      overlayFileId: null,
      audioDurationSeconds: null,
      overlayDurationSeconds: null,
      durationDifferenceSeconds: null,
      durationDifferenceRatio: null,
      koreaderDownloadAvailable: false,
    },
    formatPriority: [],
    comicMetadata: null,
    customMetadata: [],
    lockedFields: [],
    collections: [],
  }
}

function response(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

const passthrough = { template: '<div><slot /></div>' }

function mountTab(status: ReadStatus | null, extraFiles: BookDetail['files'] = []) {
  return shallowMount(DetailsTab, {
    props: { book: makeBook(status, extraFiles) },
    global: {
      stubs: {
        Popover: { template: '<div><slot /><slot name="content" /></div>' },
        PopoverTrigger: passthrough,
        PopoverContent: passthrough,
        Tooltip: passthrough,
        TooltipTrigger: passthrough,
        TooltipContent: passthrough,
      },
    },
  })
}

function readerQueries(): unknown[] {
  return mocks.push.mock.calls.map(([to]) => (to as { query?: unknown }).query)
}

async function clickButton(wrapper: ReturnType<typeof mountTab>, label: string) {
  const button = wrapper.findAll('button').find((b) => b.text().trim() === label)
  expect(button, `button "${label}"`).toBeDefined()
  await button!.trigger('click')
}

beforeEach(() => {
  mocks.push.mockReset()
  mocks.api.mockReset().mockResolvedValue(response({}))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

describe('opening the reader from the book page', () => {
  it('asks for a reread when Read again opens a finished book', async () => {
    const wrapper = mountTab('read')

    await clickButton(wrapper, 'Read again')

    expect(readerQueries()[0]).toEqual({ format: 'epub', mode: 'reread' })
  })

  it('asks for a reread when the format menu opens a finished book', async () => {
    const pdf = {
      id: 102,
      format: 'pdf',
      role: 'content',
      sizeBytes: 5678,
      absolutePath: '/books/chapter-4.pdf',
      createdAt: '2026-01-01T00:00:00.000Z',
      filename: 'chapter-4.pdf',
      durationSeconds: null,
    }
    const wrapper = mountTab('read', [pdf])

    const rows = wrapper.findAll('button').filter((b) => b.classes().includes('w-full') && b.classes().includes('gap-2.5'))
    expect(rows).toHaveLength(2)
    for (const row of rows) await row.trigger('click')

    expect(readerQueries()).toHaveLength(2)
    expect(readerQueries()).toEqual(
      expect.arrayContaining([
        { format: 'pdf', mode: 'reread' },
        { format: 'epub', mode: 'reread' },
      ]),
    )
  })

  it('opens an unfinished book with no mode', async () => {
    const wrapper = mountTab('reading')

    await clickButton(wrapper, 'Read')

    expect(readerQueries()[0]).toEqual({ format: 'epub' })
  })
})
