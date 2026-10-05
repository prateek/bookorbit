import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ReaderStatusBar from '../ReaderStatusBar.vue'

afterEach(() => {
  vi.unstubAllGlobals()
})

function standaloneMode(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches }))
  vi.stubGlobal('navigator', { standalone: matches })
}

describe('ReaderStatusBar', () => {
  it('paints the Home Screen edge with the reader theme and removes it on close', async () => {
    standaloneMode(true)
    const wrapper = mount(ReaderStatusBar, { props: { color: '#342e25' }, attachTo: document.body })
    const edge = document.body.querySelector<HTMLElement>('[aria-hidden="true"]')!

    expect(edge).not.toBeNull()
    expect(edge.style.backgroundColor).toBe('rgb(52, 46, 37)')
    await wrapper.setProps({ color: '#f1e8d0' })
    expect(edge.style.backgroundColor).toBe('rgb(241, 232, 208)')

    await wrapper.setProps({ color: null })
    expect(document.body.contains(edge)).toBe(false)
    await wrapper.setProps({ color: '#342e25' })
    const restoredEdge = document.body.querySelector('[aria-hidden="true"]')!
    expect(restoredEdge).not.toBeNull()
    wrapper.unmount()
    expect(document.body.contains(restoredEdge)).toBe(false)
  })

  it('does not paint an edge in a browser tab', () => {
    standaloneMode(false)
    const wrapper = mount(ReaderStatusBar, { props: { color: '#342e25' } })
    expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not paint an edge for non-iOS installed apps', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    vi.stubGlobal('navigator', {})
    const wrapper = mount(ReaderStatusBar, { props: { color: '#342e25' } })
    expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
