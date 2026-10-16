import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useReaderState } from '../useReaderState'
import { useRunningText } from '../useRunningText'

function mountStandalone() {
  let readerState!: ReturnType<typeof useReaderState>
  let running!: ReturnType<typeof useRunningText>
  mount(
    defineComponent({
      setup() {
        readerState = useReaderState()
        running = useRunningText({
          state: readerState.state,
          mode: readerState.activeMode,
          book: ref({ title: 'Standalone', seriesName: null }),
          chapterLabel: ref('Chapter 7'),
          page: ref(1),
          pages: ref(4),
          chapterFraction: ref(0.1),
          bookFraction: ref(0.1),
          minutesLeftInChapter: computed(() => 5),
          unreadAfter: ref(null),
          onFootTap: vi.fn<() => void>(),
        })
        return () => h('div')
      },
    }),
  )
  return { readerState, running }
}

describe('useRunningText tap cycle', () => {
  it('steps from the saved slot past items that would repeat the line', () => {
    const { readerState, running } = mountStandalone()
    readerState.setFooterRight('percent')
    expect(running.nextFooterRight()).toBe('time-left')
  })

  it('still steps while the foot is hidden', () => {
    const { readerState, running } = mountStandalone()
    readerState.setFooterRight('percent')
    readerState.setInformationDisplay('hidden')
    expect(running.text.value.right).toBe('')
    expect(running.nextFooterRight()).toBe('time-left')
  })
})
