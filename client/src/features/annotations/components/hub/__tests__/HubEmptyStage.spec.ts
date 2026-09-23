import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import HubEmptyStage from '../HubEmptyStage.vue'

async function mountStage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div />' } },
      { path: '/libraries', name: 'libraries', component: { template: '<div />' } },
    ],
  })
  await router.push('/libraries')
  await router.isReady()
  return mount(HubEmptyStage, { global: { plugins: [router] } })
}

describe('HubEmptyStage', () => {
  it('uses a short heading and sends the reader back to what they were reading', async () => {
    const wrapper = await mountStage()

    expect(wrapper.get('h2').text()).toBe('No highlights yet')
    const cta = wrapper.get('a')
    expect(cta.text()).toContain('Continue reading')
    expect(cta.attributes('href')).toBe('/')
  })

  it('keeps the device sync cards off phone screens', async () => {
    const wrapper = await mountStage()

    expect(wrapper.get('[data-source="web"]').classes()).not.toContain('max-sm:hidden')
    expect(wrapper.get('[data-source="kobo"]').classes()).toContain('max-sm:hidden')
    expect(wrapper.get('[data-source="koreader"]').classes()).toContain('max-sm:hidden')
  })
})
