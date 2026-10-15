import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { BookSeriesMembership } from '@bookorbit/types'
import { useReaderState } from '../useReaderState'
import { useRunningText } from '../useRunningText'

function membership(seriesId: number, seriesIndex: string | null, displayOrder: number): BookSeriesMembership {
  return { seriesId, seriesName: `Series ${seriesId}`, seriesIndex, displayOrder, expectedBookCount: null }
}

function chapterFooter(book: Parameters<typeof useRunningText>[0]['book']['value']): string {
  let text!: ReturnType<typeof useRunningText>
  mount(
    defineComponent({
      setup() {
        const state = useReaderState()
        state.setFooterRight('chapter')
        text = useRunningText({
          state: state.state,
          mode: state.activeMode,
          book: ref(book),
          chapterLabel: ref('Chapter 7'),
          page: ref(1),
          pages: ref(4),
          chapterFraction: ref(0.1),
          bookFraction: ref(0.1),
          minutesLeftInChapter: computed(() => null),
          unreadAfter: ref(null),
          onFootTap: vi.fn<() => void>(),
        })
        return () => h('div')
      },
    }),
  )
  return text.text.value.right
}

describe('chapter number in the footer', () => {
  it('numbers the chapter by the series the reader treats as primary', () => {
    const book = {
      title: 'Chapter 7',
      seriesName: 'Side Stories',
      seriesIndex: '9',
      seriesMemberships: [membership(2, '9', 1), membership(1, '2.4', 0)],
    }
    expect(chapterFooter(book)).toBe('#2.4')
  })

  it('falls back to the book series number when there are no memberships', () => {
    expect(chapterFooter({ title: 'Chapter 7', seriesName: 'Forge', seriesIndex: '12' })).toBe('#12')
  })
})
