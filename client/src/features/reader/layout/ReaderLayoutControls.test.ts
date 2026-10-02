import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { useReaderState } from '../epub/composables/useReaderState'
import ReaderLayoutControls from './ReaderLayoutControls.vue'

describe('reader layout controls', () => {
  it('changes information without discarding the chosen header and footer', async () => {
    const state = useReaderState()
    const wrapper = mount(ReaderLayoutControls, { props: { state: state.state.value } })
    const group = wrapper.get('[aria-label="Reading information"]')
    await group
      .findAll('button')
      .find((button) => button.text() === 'Hidden')!
      .trigger('click')
    await group
      .findAll('button')
      .find((button) => button.text() === 'Progress only')!
      .trigger('click')
    expect(wrapper.emitted('update')).toEqual([[{ informationDisplay: 'hidden' }], [{ informationDisplay: 'progress' }]])
    expect(state.state.value).toMatchObject({ runningHead: 'chapter', footerLeft: 'page', footerRight: 'percent' })
  })

  it('adjusts horizontal and vertical spacing independently', async () => {
    const state = useReaderState()
    const wrapper = mount(ReaderLayoutControls, { props: { state: state.state.value } })
    const ranges = wrapper.findAll('input[type="range"]')
    await ranges[0]!.setValue('3')
    await ranges[1]!.setValue('12')
    expect(wrapper.emitted('update')).toEqual([[{ gap: 0.03 }], [{ verticalMargin: 12 }]])
  })
})
