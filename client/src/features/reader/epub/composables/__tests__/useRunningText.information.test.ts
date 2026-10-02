import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useReaderState } from '../useReaderState'
import { useRunningText } from '../useRunningText'

describe('page reading information', () => {
  it('hides running text and restores selected content without changing typography', () => {
    let state!: ReturnType<typeof useReaderState>
    let text!: ReturnType<typeof useRunningText>
    mount(
      defineComponent({
        setup() {
          state = useReaderState()
          state.setFontSize(17)
          state.setRunningHead('series-chapter')
          text = useRunningText({
            state: state.state,
            mode: state.activeMode,
            book: ref({ title: 'Book', seriesName: 'Series' }),
            chapterLabel: ref('Chapter 1002'),
            page: ref(3),
            pages: ref(12),
            chapterFraction: ref(0.3),
            bookFraction: ref(0.3),
            minutesLeftInChapter: computed(() => 9),
            unreadAfter: ref(null),
            onFootTap: vi.fn<() => void>(),
          })
          return () => h('div')
        },
      }),
    )
    const renderer = {
      heads: [document.createElement('div')],
      feet: [document.createElement('div')],
      setAttribute: vi.fn<() => void>(),
      removeAttribute: vi.fn<() => void>(),
    }
    text.render(renderer)
    const selected = text.text.value
    const css = state.generateCSS()
    for (const display of ['hidden', 'progress'] as const) {
      state.setInformationDisplay(display)
      text.render(renderer)
      expect(renderer.heads[0]!.textContent).toBe('')
      expect(renderer.feet[0]!.children.length).toBe(0)
      expect(text.toolbarTitle.value).toEqual({ series: 'Series', chapter: 'Chapter 1002' })
      expect(state.generateCSS()).toBe(css)
    }
    state.setInformationDisplay('full')
    text.render(renderer)
    expect(text.text.value).toEqual(selected)
    expect(renderer.heads[0]!.textContent).toBe('Series · Chapter 1002')
    expect(renderer.feet[0]!.textContent).toContain('3 of 12')
  })
})
