import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReaderSettingsPanel from '../ReaderSettingsPanel.vue'
import { useReaderState } from '../../composables/useReaderState'

describe('rich settings while reading information is hidden', () => {
  it.each(['hidden', 'progress', 'full'] as const)('retains header and footer choices with %s information', async (display) => {
    const state = useReaderState()
    state.setInformationDisplay(display)
    const wrapper = mount(ReaderSettingsPanel, { props: { state: state.state.value } })
    const bottomRight = wrapper.get('[aria-label="Bottom right"]')
    await bottomRight
      .findAll('button')
      .find((button) => button.text() === 'Time left')!
      .trigger('click')
    expect(wrapper.emitted('update')).toEqual([[{ footerRight: 'time-left' }]])
    expect(state.informationDisplay.value).toBe(display)
    expect(wrapper.find('[data-testid="reading-layout-setting"]').exists()).toBe(true)
  })
})
