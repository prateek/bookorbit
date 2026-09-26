import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useReaderThemeColor } from '../useReaderThemeColor'

function addThemeColorMeta(content: string) {
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', content)
  document.head.append(meta)
  return meta
}

function mountWith(color: () => string | null) {
  return mount(
    defineComponent({
      setup() {
        useReaderThemeColor(color)
        return () => h('div')
      },
    }),
  )
}

beforeEach(() => {
  // jsdom has no canvas; the computed color is used as it is.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove())
  document.body.style.backgroundColor = ''
})

describe('useReaderThemeColor', () => {
  it('follows the page color while mounted', async () => {
    const meta = addThemeColorMeta('rgb(10, 10, 10)')
    const page = ref('#342e25')
    mountWith(() => page.value)

    expect(document.body.style.backgroundColor).toBe('rgb(52, 46, 37)')
    expect(meta.getAttribute('content')).toBe('rgb(52, 46, 37)')

    page.value = '#f1e8d0'
    await nextTick()
    expect(meta.getAttribute('content')).toBe('rgb(241, 232, 208)')
  })

  it('restores the body background on close and re-derives the status bar color from it', () => {
    const meta = addThemeColorMeta('rgb(10, 10, 10)')
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    const wrapper = mountWith(() => '#342e25')

    document.body.style.backgroundColor = 'rgb(20, 20, 20)'
    wrapper.unmount()

    expect(document.body.style.backgroundColor).toBe('rgb(10, 10, 10)')
    expect(meta.getAttribute('content')).toBe('rgb(10, 10, 10)')
  })

  it('leaves the app colors alone when the reader is not styling the page', () => {
    const meta = addThemeColorMeta('rgb(10, 10, 10)')
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    mountWith(() => null)

    expect(document.body.style.backgroundColor).toBe('rgb(10, 10, 10)')
    expect(meta.getAttribute('content')).toBe('rgb(10, 10, 10)')
  })
})
