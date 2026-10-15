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

describe('ReaderSettingsPanel chapter footer', () => {
  it('offers the chapter number for the bottom right', async () => {
    const wrapper = mount(ReaderSettingsPanel, { props: { state } })
    const chapter = wrapper
      .get('[data-testid="header-footer-setting"] [aria-label="Bottom right"]')
      .findAll('button')
      .find((button) => button.text() === 'Chapter')

    await chapter?.trigger('click')

    expect(wrapper.emitted('update')).toEqual([[{ footerRight: 'chapter' }]])
  })
})
