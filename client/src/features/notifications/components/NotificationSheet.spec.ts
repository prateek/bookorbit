import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import NotificationSheet from './NotificationSheet.vue'

const notificationMocks = vi.hoisted(() => ({
  clearAll: vi.fn<() => Promise<void>>(),
}))

vi.mock('../composables/useNotifications', () => ({
  useNotifications: () => ({
    notifications: ref([{ id: 1 }]),
    unreadCount: ref(0),
    loading: ref(false),
    hasMore: ref(false),
    fetchNotifications: vi.fn<(reset?: boolean) => Promise<void>>().mockResolvedValue(undefined),
    markAsRead: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
    markAllAsRead: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dismiss: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
    clearAll: notificationMocks.clearAll,
  }),
}))

const stubs = {
  Button: { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
  Sheet: {
    props: ['open'],
    emits: ['update:open'],
    template: '<div data-testid="sheet" :data-open="String(open)"><i data-testid="open-sheet" @click="$emit(\'update:open\', true)" /><slot /></div>',
  },
  SheetTrigger: { template: '<div><slot /></div>' },
  SheetContent: { template: '<div><slot /></div>' },
  SheetDescription: { template: '<div><slot /></div>' },
  SheetHeader: { template: '<div><slot /></div>' },
  SheetTitle: { template: '<div><slot /></div>' },
  Tooltip: { template: '<div><slot /></div>' },
  TooltipTrigger: { template: '<div><slot /></div>' },
  TooltipContent: { template: '<div data-testid="tooltip-content"><slot /></div>' },
  NotificationItemVue: { emits: ['navigate'], template: '<button type="button" data-testid="item" @click="$emit(\'navigate\')" />' },
  ConfirmDialog: {
    props: ['open', 'title'],
    emits: ['confirm', 'cancel'],
    template: '<div v-if="open" data-testid="confirm-clear"><button data-testid="confirm" @click="$emit(\'confirm\')" /></div>',
  },
}

function mountSheet() {
  return mount(NotificationSheet, {
    props: { iconRadiusClass: 'rounded-md' },
    global: { stubs },
  })
}

describe('NotificationSheet trigger', () => {
  it('provides an accessible name and matching tooltip', () => {
    const wrapper = mount(NotificationSheet, {
      props: { iconRadiusClass: 'rounded-md' },
      global: { stubs },
    })

    expect(wrapper.get('button').attributes('aria-label')).toBe('Notifications')
    expect(wrapper.get('[data-testid="tooltip-content"]').text()).toBe('Notifications')
  })
})

describe('NotificationSheet actions', () => {
  it('asks before clearing every notification', async () => {
    notificationMocks.clearAll.mockResolvedValue(undefined)
    const wrapper = mountSheet()
    const clearButton = wrapper.findAll('button').find((button) => button.text() === 'Clear')

    await clearButton!.trigger('click')

    expect(notificationMocks.clearAll).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="confirm"]').trigger('click')
    expect(notificationMocks.clearAll).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid="confirm-clear"]').exists()).toBe(false)
  })

  it('closes the sheet when a notification navigates', async () => {
    const wrapper = mountSheet()
    await wrapper.get('[data-testid="open-sheet"]').trigger('click')
    expect(wrapper.get('[data-testid="sheet"]').attributes('data-open')).toBe('true')

    await wrapper.get('[data-testid="item"]').trigger('click')

    expect(wrapper.get('[data-testid="sheet"]').attributes('data-open')).toBe('false')
  })
})
