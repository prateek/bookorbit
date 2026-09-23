import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ToggleSwitch from './ToggleSwitch.vue'

describe('ToggleSwitch', () => {
  it('keeps the thumb contained at logical track positions', async () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } })
    const track = wrapper.get('[role="switch"]')
    const thumb = track.get('span')

    expect(track.classes()).toContain('overflow-hidden')
    expect(thumb.classes()).toEqual(expect.arrayContaining(['absolute', 'start-0']))
    expect(track.attributes('aria-checked')).toBe('false')

    await wrapper.setProps({ modelValue: true })

    expect(thumb.classes()).toEqual(expect.arrayContaining(['start-4', 'pointer-coarse:start-5']))
    expect(thumb.classes()).not.toContain('start-0')
    expect(track.attributes('aria-checked')).toBe('true')
  })

  it('grows to the iOS switch size on touch screens', () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } })
    const track = wrapper.get('[role="switch"]')

    expect(track.classes()).toEqual(expect.arrayContaining(['pointer-coarse:h-[31px]', 'pointer-coarse:w-[51px]']))
    expect(track.get('span').classes()).toEqual(expect.arrayContaining(['pointer-coarse:h-[27px]', 'pointer-coarse:w-[27px]']))
  })

  it('emits the next checked state when clicked', async () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } })

    await wrapper.get('[role="switch"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })
})
