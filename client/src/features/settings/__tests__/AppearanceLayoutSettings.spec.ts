import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useDisplaySettings } from '@/composables/useDisplaySettings'
import AppearanceLayoutSettings from '../AppearanceLayoutSettings.vue'

const touchLabelFallback = ref(false)

vi.mock('@/features/book/composables/useGridCardLabels', () => ({
  useGridCardLabels: () => ({ touchLabelFallback }),
}))

describe('AppearanceLayoutSettings on phones', () => {
  beforeEach(() => {
    touchLabelFallback.value = false
    useDisplaySettings().seriesCardCoverMode.value = 'stack'
  })

  it('keeps the pixel sliders behind a disclosure until asked for', async () => {
    const wrapper = mount(AppearanceLayoutSettings)
    const rows = () => wrapper.findAll('[data-testid="layout-sizing-row"]')

    expect(rows().length).toBeGreaterThan(0)
    expect(rows().every((row) => row.classes().includes('max-md:hidden'))).toBe(true)

    await wrapper.get('[data-testid="layout-sizing-toggle"]').trigger('click')

    expect(wrapper.get('[data-testid="layout-sizing-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(rows().some((row) => row.classes().includes('max-md:hidden'))).toBe(false)
  })

  it('offers the collapsed series cover modes as 44px radio rows', async () => {
    const wrapper = mount(AppearanceLayoutSettings)
    const options = wrapper.findAll('[data-testid="series-cover-option"]')

    expect(options).toHaveLength(5)
    expect(options.every((option) => option.classes().includes('max-md:min-h-11'))).toBe(true)
    expect(options[0]?.attributes('aria-checked')).toBe('true')

    await options[4]?.trigger('click')

    expect(useDisplaySettings().seriesCardCoverMode.value).toBe('first-unread')
    expect(wrapper.findAll('[data-testid="series-cover-option"]')[4]?.attributes('aria-checked')).toBe('true')
  })

  it('explains that hover labels show below covers on a screen that cannot hover', async () => {
    const wrapper = mount(AppearanceLayoutSettings)
    expect(wrapper.find('[data-testid="card-info-touch-hint"]').exists()).toBe(false)

    touchLabelFallback.value = true
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="card-info-touch-hint"]').text()).toContain('below covers')
  })
})
