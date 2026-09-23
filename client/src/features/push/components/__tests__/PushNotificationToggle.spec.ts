import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PushToggleResult } from '../../composables/usePushNotifications'

const state = vi.hoisted(() => ({
  enable: vi.fn<() => Promise<PushToggleResult>>(),
  disable: vi.fn<() => Promise<PushToggleResult>>(),
  refresh: vi.fn<() => Promise<void>>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  toastError: vi.fn<(message: string) => void>(),
}))

const support = ref<'supported' | 'needs-home-screen' | 'unsupported'>('supported')
const permission = ref<NotificationPermission>('default')
const subscribed = ref(false)

vi.mock('../../composables/usePushNotifications', () => ({
  usePushNotifications: () => ({
    support,
    isAppleMobile: true,
    permission,
    subscribed,
    busy: ref(false),
    refresh: state.refresh,
    enable: state.enable,
    disable: state.disable,
  }),
}))
vi.mock('vue-sonner', () => ({ toast: { success: state.toastSuccess, error: state.toastError } }))

import PushNotificationToggle from '../PushNotificationToggle.vue'

describe('PushNotificationToggle', () => {
  beforeEach(() => {
    support.value = 'supported'
    permission.value = 'default'
    subscribed.value = false
    Object.values(state).forEach((fn) => fn.mockReset())
    state.refresh.mockResolvedValue(undefined)
  })

  it('turns push on from the switch and explains the iPhone Home Screen requirement', async () => {
    state.enable.mockResolvedValue('enabled')
    const wrapper = mount(PushNotificationToggle)

    expect(wrapper.text()).toContain('Push notifications on this device')
    expect(wrapper.text()).toContain('Home Screen')
    expect(state.refresh).toHaveBeenCalled()

    await wrapper.get('button[role="switch"]').trigger('click')
    await flushPromises()
    expect(state.enable).toHaveBeenCalledTimes(1)
    expect(state.toastSuccess).toHaveBeenCalled()
  })

  it('makes the whole row a tap target for the switch', () => {
    const wrapper = mount(PushNotificationToggle)
    const label = wrapper.get('label')
    const button = wrapper.get('button[role="switch"]')
    expect(label.attributes('for')).toBe(button.attributes('id'))
  })

  it('disables the switch and says how to install when Safari is not in Home Screen mode', () => {
    support.value = 'needs-home-screen'
    const wrapper = mount(PushNotificationToggle)

    expect(wrapper.get('button[role="switch"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Add to Home Screen')
  })

  it('explains a blocked permission instead of offering the switch', () => {
    permission.value = 'denied'
    const wrapper = mount(PushNotificationToggle)

    expect(wrapper.get('button[role="switch"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Notifications are blocked')
  })

  it('turns push off when already subscribed', async () => {
    subscribed.value = true
    state.disable.mockResolvedValue('disabled')
    const wrapper = mount(PushNotificationToggle)

    await wrapper.get('button[role="switch"]').trigger('click')
    await flushPromises()
    expect(state.disable).toHaveBeenCalledTimes(1)
  })
})
