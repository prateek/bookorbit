import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import { useRunningText } from '../useRunningText'
import type { FoliateRenderer } from '../useFoliate'
import type { ReaderState } from '../useReaderState'

function renderer(): FoliateRenderer {
  return {
    heads: [document.createElement('div')],
    feet: [document.createElement('div')],
    setAttribute: vi.fn<() => void>(),
    removeAttribute: vi.fn<() => void>(),
  }
}

function setup() {
  let api!: ReturnType<typeof useRunningText>
  const page = ref(3)
  mount(
    defineComponent({
      setup() {
        // Cast so the same sources compile at every step of the stack, whichever optional ones exist.
        api = useRunningText({
          state: computed(() => ({ fontSize: 17, runningHead: 'chapter', footerLeft: 'page', footerRight: 'percent' }) as ReaderState),
          mode: computed(() => ({ fg: '#000', bg: '#fff', link: '#00f' })),
          book: ref(null),
          chapterLabel: ref('Chapter 430'),
          page,
          pages: ref(12),
          chapterFraction: ref(0.2),
          bookFraction: ref(0.27),
          minutesLeftInChapter: computed(() => null),
          unreadAfter: ref(null),
          onFootTap: vi.fn<() => void>(),
        } as Parameters<typeof useRunningText>[0])
        return () => h('div')
      },
    }),
    { global: { plugins: [i18n] } },
  )
  return { api, page }
}

describe('useRunningText render', () => {
  it('writes the head and foot once for the same text and elements', () => {
    const { api } = setup()
    const r = renderer()

    api.render(r)
    const row = r.feet![0]!.firstChild
    api.render(r)

    expect(r.heads![0]!.textContent).toBe('Chapter 430')
    expect(r.feet![0]!.firstChild).toBe(row)
  })

  it('writes again after the paginator lays out new elements or the text changes', async () => {
    const { api, page } = setup()
    const first = renderer()
    api.render(first)

    const relaid = renderer()
    api.render(relaid)
    expect(relaid.feet![0]!.textContent).toContain('3 of 12')

    page.value = 4
    await Promise.resolve()
    api.render(relaid)
    expect(relaid.feet![0]!.textContent).toContain('4 of 12')
  })
})
