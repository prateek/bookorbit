import { beforeAll, describe, expect, it } from 'vitest'

// Paginator ships as a static browser module, so its scrolled-flow progress helper is exercised here.
let getScrolledProgress: (start: number, size: number, viewSize: number) => { fraction: number; size: number }

describe('paginator scrolled-flow progress', () => {
  beforeAll(async () => {
    Object.assign(globalThis, { NodeFilter: window.NodeFilter, CSS: window.CSS })
    const paginatorModulePath = '../../../../../../public/assets/foliate/paginator.js'
    ;({ getScrolledProgress } = (await import(paginatorModulePath)) as { getScrolledProgress: typeof getScrolledProgress })
  })

  const total = ({ fraction, size }: { fraction: number; size: number }) => fraction + size

  it('reaches the end of the section at the bottom of the last screen', () => {
    expect(total(getScrolledProgress(9000, 1000, 10000))).toBe(1)
  })

  it('treats a couple of pixels short of the bottom as the bottom', () => {
    expect(total(getScrolledProgress(8998.5, 1000, 10000))).toBe(1)
  })

  it('measures progress to the bottom of the visible screen mid-section', () => {
    const progress = getScrolledProgress(4000, 1000, 10000)
    expect(progress.fraction).toBe(0.4)
    expect(total(progress)).toBeCloseTo(0.5)
  })

  it('reports nothing for a section that has not been laid out', () => {
    expect(getScrolledProgress(0, 1000, 0)).toEqual({ fraction: 0, size: 0 })
  })
})
