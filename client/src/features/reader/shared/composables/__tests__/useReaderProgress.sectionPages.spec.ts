import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useReaderProgress } from '../useReaderProgress'
import type { RelocateDetail } from '../../../epub/composables/useFoliate'

vi.mock('@/lib/api', () => ({ api: vi.fn<(...args: unknown[]) => Promise<unknown>>() }))

function detail(contentSourceProgressPercent: number | null): RelocateDetail {
  return { cfi: 'epubcfi(/6/4)', fraction: 0.35, index: 2, contentSourceProgressPercent }
}

describe('useReaderProgress section pages', () => {
  it('records the page within the section and the fraction of it read', () => {
    const progress = useReaderProgress(1, 1, ref(0))
    progress.onRelocate(detail(25), { page: 3, pages: 12 })

    expect(progress.sectionPage.value).toBe(3)
    expect(progress.sectionPages.value).toBe(12)
    expect(progress.sectionFraction.value).toBe(0.25)
  })

  it('clears them when the renderer has no pages, as in scrolled flow', () => {
    const progress = useReaderProgress(1, 1, ref(0))
    progress.onRelocate(detail(25), { page: 3, pages: 12 })
    progress.onRelocate(detail(null))

    expect(progress.sectionPage.value).toBeNull()
    expect(progress.sectionPages.value).toBeNull()
    expect(progress.sectionFraction.value).toBeNull()
  })

  it('shows the page within the section in the page footer mode', () => {
    const progress = useReaderProgress(1, 1, ref(0))
    progress.onRelocate(detail(25), { page: 3, pages: 12 })
    const foot = document.createElement('div')
    progress.updateHeadsFeet(
      { heads: [document.createElement('div')], feet: [foot], setAttribute: vi.fn<() => void>(), removeAttribute: vi.fn<() => void>() },
      { fg: '#000', bg: '#fff' },
    )

    expect(foot.textContent).toContain('Page 3 of 12')
  })
})
