import { computed, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildRunningText, buildToolbarTitle, type RunningText, type RunningTextPosition } from '../../shared/lib/running-text'
import type { ThemeMode } from '../constants/themes'
import type { FoliateRenderer } from './useFoliate'
import type { ReaderState } from './useReaderState'

interface RunningTextSources {
  state: ComputedRef<ReaderState>
  mode: ComputedRef<ThemeMode>
  book: Ref<{ title: string | null; seriesName: string | null } | null>
  chapterLabel: Ref<string>
  page: Ref<number | null>
  pages: Ref<number | null>
  chapterFraction: Ref<number | null>
  bookFraction: Ref<number>
  minutesLeftInChapter: ComputedRef<number | null>
  onFootTap: () => void
}

const RUNNING_TEXT_SCALE = 0.8
const RUNNING_TEXT_MIN_PX = 11
const RUNNING_TEXT_MAX_PX = 18

function span(text: string, align: 'left' | 'right'): HTMLSpanElement {
  const el = document.createElement('span')
  el.textContent = text
  el.style.cssText = `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: ${align};`
  return el
}

/** What the lines above and below the page say, built once for the paginated head and foot and the toolbar title. */
export function useRunningText(sources: RunningTextSources) {
  const { t } = useI18n()

  const position = computed<RunningTextPosition>(() => ({
    chapterLabel: sources.chapterLabel.value,
    bookTitle: sources.book.value?.title ?? null,
    seriesName: sources.book.value?.seriesName ?? null,
    page: sources.page.value,
    pages: sources.pages.value,
    chapterFraction: sources.chapterFraction.value,
    bookFraction: sources.bookFraction.value,
    minutesLeftInChapter: sources.minutesLeftInChapter.value,
  }))

  const text = computed<RunningText>(() => buildRunningText(position.value, sources.state.value, t))
  const toolbarTitle = computed(() => buildToolbarTitle(position.value))
  const fontSize = computed(
    () => `${Math.min(RUNNING_TEXT_MAX_PX, Math.max(RUNNING_TEXT_MIN_PX, Math.round(sources.state.value.fontSize * RUNNING_TEXT_SCALE)))}px`,
  )

  function onFootClick(event: MouseEvent) {
    event.stopPropagation()
    sources.onFootTap()
  }

  /** Fills the paginator's head and foot; they are rebuilt on every layout, so call after each relocate. */
  let rendered: { heads: unknown; feet: unknown; key: string } | null = null

  function render(renderer: FoliateRenderer | null) {
    if (!renderer) return
    const { head, left, right } = text.value
    const style = `color: ${sources.mode.value.fg}; font-size: ${fontSize.value};`
    // The paginator replaces its head and foot elements on every layout; otherwise a repeat call
    // with the same text has nothing to do.
    const key = `${style}|${head}|${left}|${right}`
    if (rendered && rendered.heads === renderer.heads && rendered.feet === renderer.feet && rendered.key === key) return
    rendered = { heads: renderer.heads, feet: renderer.feet, key }

    renderer.heads?.forEach((headEl, index) => {
      if (!headEl) return
      headEl.style.cssText = style
      headEl.textContent = index === 0 ? head : ''
    })

    const feet = renderer.feet ?? []
    feet.forEach((footEl, index) => {
      if (!footEl) return
      const row = document.createElement('div')
      row.style.cssText = `${style} display: flex; justify-content: space-between; gap: 1em; width: 100%; cursor: pointer;`
      row.addEventListener('click', onFootClick)
      const isFirst = index === 0
      const isLast = index === feet.length - 1
      row.append(span(isFirst ? left : '', 'left'), span(isLast ? right : '', 'right'))
      footEl.replaceChildren(row)
    })
  }

  return { text, toolbarTitle, render }
}
