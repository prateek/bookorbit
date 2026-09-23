import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MetadataScoreBadge from '../MetadataScoreBadge.vue'

describe('MetadataScoreBadge', () => {
  it('labels the score as metadata so it does not read as progress', () => {
    const wrapper = mount(MetadataScoreBadge, { props: { score: 58 } })

    expect(wrapper.text()).toBe('Metadata 58%')
    expect(wrapper.attributes('aria-label')).toBe('Metadata score 58%')
  })

  it('renders nothing without a score', () => {
    const wrapper = mount(MetadataScoreBadge, { props: { score: null } })

    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('emits click', async () => {
    const wrapper = mount(MetadataScoreBadge, { props: { score: 91 } })
    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
