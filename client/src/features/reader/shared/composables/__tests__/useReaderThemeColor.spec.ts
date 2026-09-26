import { afterEach, describe, expect, it } from 'vitest'
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

afterEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove())
  document.body.style.backgroundColor = ''
})

describe('useReaderThemeColor', () => {
  it('follows the page color while mounted and restores the app color after', async () => {
    const meta = addThemeColorMeta('rgb(10, 10, 10)')
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    const page = ref('#342e25')
    const wrapper = mount(
      defineComponent({
        setup() {
          useReaderThemeColor(() => page.value)
          return () => h('div')
        },
      }),
    )

    expect(meta.getAttribute('content')).toBe('#342e25')
    expect(document.body.style.backgroundColor).toBe('rgb(52, 46, 37)')

    page.value = '#f1e8d0'
    await nextTick()
    expect(meta.getAttribute('content')).toBe('#f1e8d0')

    wrapper.unmount()
    expect(meta.getAttribute('content')).toBe('rgb(10, 10, 10)')
    expect(document.body.style.backgroundColor).toBe('rgb(10, 10, 10)')
  })
})
