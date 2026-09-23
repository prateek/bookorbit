import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AchievementFilterBar from '../components/AchievementFilterBar.vue'

describe('AchievementFilterBar', () => {
  function mountComponent() {
    return mount(AchievementFilterBar, {
      props: {
        activeFilter: 'all',
        totalEarned: 2,
        totalAvailable: 5,
        earnedCount: 2,
        inProgressCount: 1,
        lockedCount: 2,
      },
    })
  }

  it('renders achievements heading and tier summary', () => {
    const wrapper = mountComponent()
    expect(wrapper.text()).toContain('Achievements')
    expect(wrapper.text()).toContain('2 / 5 tiers')
  })

  it('renders a muted trophy icon on desktop', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('emits filter changes when pills are clicked', async () => {
    const wrapper = mountComponent()
    const buttons = wrapper.findAll('button')

    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')
    await buttons[2]!.trigger('click')
    await buttons[3]!.trigger('click')

    expect(wrapper.emitted('change')).toEqual([['all'], ['earned'], ['in-progress'], ['locked']])
  })

  it('lays the filters out as a four-column grid with finger-sized targets instead of a sideways scroller', () => {
    const wrapper = mountComponent()
    const buttons = wrapper.findAll('button')

    expect(buttons[0]!.element.parentElement!.classList).toContain('grid-cols-4')
    expect(wrapper.find('.overflow-x-auto').exists()).toBe(false)
    for (const button of buttons) expect(button.classes()).toContain('min-h-11')
    expect(buttons[0]!.attributes('aria-pressed')).toBe('true')
    expect(buttons[3]!.text()).toContain('Locked')
    expect(buttons[3]!.text()).toContain('2')
  })
})
