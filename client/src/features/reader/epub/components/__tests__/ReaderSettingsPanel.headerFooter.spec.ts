import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReaderSettingsPanel from '../ReaderSettingsPanel.vue'
import type { ReaderState } from '../../composables/useReaderState'

const state: ReaderState = {
  fontSize: 16,
  lineHeight: 1.5,
  paragraphSpacing: 0,
  letterSpacing: null,
  wordSpacing: null,
  textIndent: null,
  fontFamily: null,
  fontWeight: 400,
  fontStyle: 'normal',
  maxColumnCount: 2,
  gap: 0.05,
  maxInlineSize: 720,
  maxBlockSize: 1440,
  justify: true,
  hyphenate: true,
  isDark: false,
  themeName: 'default',
  flow: 'paginated',
  fixedLayoutSpread: 'auto',
  runningHead: 'chapter',
  footerLeft: 'page',
  footerRight: 'percent',
}

describe('ReaderSettingsPanel header and footer', () => {
  it('chooses what the lines above and below the page show', async () => {
    const wrapper = mount(ReaderSettingsPanel, { props: { state } })
    const group = wrapper.get('[data-testid="header-footer-setting"]')
    const segment = (label: string, text: string) =>
      group
        .get(`[aria-label="${label}"]`)
        .findAll('button')
        .find((button) => button.text() === text)

    expect(segment('Top line', 'Chapter')?.attributes('aria-pressed')).toBe('true')
    await segment('Top line', 'Off')?.trigger('click')
    await segment('Bottom left', 'Pages left')?.trigger('click')
    await segment('Bottom right', 'Time left')?.trigger('click')

    expect(wrapper.emitted('update')).toEqual([[{ runningHead: 'off' }], [{ footerLeft: 'pages-left' }], [{ footerRight: 'time-left' }]])
  })

  it('offers the series before the chapter in the top line', async () => {
    const wrapper = mount(ReaderSettingsPanel, { props: { state } })
    const withSeries = wrapper
      .get('[aria-label="Top line"]')
      .findAll('button')
      .find((button) => button.text() === 'With series')

    await withSeries?.trigger('click')

    expect(wrapper.emitted('update')).toEqual([[{ runningHead: 'series-chapter' }]])
  })
})
