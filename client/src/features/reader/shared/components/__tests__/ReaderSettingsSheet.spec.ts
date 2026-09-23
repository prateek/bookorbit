import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import ReaderSettingsSheet from '../ReaderSettingsSheet.vue'

const SheetStub = defineComponent({
  name: 'SheetStub',
  props: { open: { type: Boolean, default: false } },
  emits: ['update:open'],
  template: '<div data-testid="sheet"><slot /></div>',
})

const SheetContentStub = defineComponent({
  name: 'SheetContentStub',
  template: '<div data-testid="sheet-content"><slot /></div>',
})

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: () => {} })
})

function pointer(type: string, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientY })
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } })
  return event
}

async function dragGrabber(wrapper: ReturnType<typeof mountSheet>, deltaY: number) {
  const grabber = wrapper.get('[data-sheet-grabber]').element
  grabber.dispatchEvent(pointer('pointerdown', 400))
  grabber.dispatchEvent(pointer('pointermove', 400 + deltaY))
  grabber.dispatchEvent(pointer('pointerup', 400 + deltaY))
  await wrapper.vm.$nextTick()
}

function mountSheet(props: Record<string, unknown> = {}) {
  return mount(ReaderSettingsSheet, {
    props: { open: true, ...props },
    slots: { default: '<p data-testid="panel">Panel body</p>' },
    global: { stubs: { Sheet: SheetStub, SheetContent: SheetContentStub } },
  })
}

describe('ReaderSettingsSheet', () => {
  it('renders the settings panel passed into the default slot', () => {
    const wrapper = mountSheet()

    expect(wrapper.get('[data-testid="panel"]').text()).toBe('Panel body')
  })

  it('forwards the open state to the sheet', async () => {
    const wrapper = mountSheet({ open: false })
    expect(wrapper.findComponent(SheetStub).props('open')).toBe(false)

    await wrapper.setProps({ open: true })
    expect(wrapper.findComponent(SheetStub).props('open')).toBe(true)
  })

  describe('closing', () => {
    // The reported bug: `hide-close` dropped the built-in X and nothing replaced it, so on a phone
    // there was no reachable way out of the panel at all. Every assertion here guards one of the
    // three exits the reporter found missing.
    it('offers a close button with an accessible label', () => {
      const wrapper = mountSheet()
      const close = wrapper.get('button[aria-label="Close settings"]')

      expect(close.element.tagName).toBe('BUTTON')
      expect(close.attributes('type')).toBe('button')
    })

    it('emits update:open false when the close button is activated', async () => {
      const wrapper = mountSheet()

      await wrapper.get('button[aria-label="Close settings"]').trigger('click')

      expect(wrapper.emitted('update:open')).toEqual([[false]])
    })

    it('forwards the sheet dismissing itself, which covers overlay taps and Escape', () => {
      const wrapper = mountSheet()

      wrapper.findComponent(SheetStub).vm.$emit('update:open', false)

      expect(wrapper.emitted('update:open')).toEqual([[false]])
    })

    it('emits nothing until something is actually activated', () => {
      const wrapper = mountSheet()

      expect(wrapper.emitted('update:open')).toBeUndefined()
    })

    it('keeps the close button as the only interactive control in the sheet chrome', () => {
      const wrapper = mountSheet()
      const buttons = wrapper.findAll('button')

      expect(buttons).toHaveLength(1)
      expect(buttons[0].attributes('aria-label')).toBe('Close settings')
    })

    it('turns the grab handle into a real control', () => {
      const grabber = mountSheet().get('[data-sheet-grabber]')

      expect(grabber.attributes('role')).toBe('button')
      expect(grabber.attributes('aria-label')).toBe('Expand panel')
    })

    it('dismisses when the grab handle is swiped down', async () => {
      const wrapper = mountSheet()

      await dragGrabber(wrapper, 300)

      expect(wrapper.emitted('update:open')).toEqual([[false]])
    })
  })

  describe('sheet geometry', () => {
    it('opens at half height so the page stays visible, measured against the dynamic viewport', () => {
      // `vh` resolves against the toolbar-retracted viewport, so on a phone with browser chrome
      // showing a vh-sized sheet covered everything. jsdom has no layout, so the tokens are the check.
      const content = mountSheet().get('[data-testid="sheet-content"]')

      expect(content.attributes('style')).toContain('height: 56dvh')
      expect(content.classes()).toContain('max-h-[92dvh]')
    })

    it('expands to full height when the grab handle is swiped up', async () => {
      const wrapper = mountSheet()

      await dragGrabber(wrapper, -300)

      expect(wrapper.get('[data-testid="sheet-content"]').attributes('style')).toContain('height: 92dvh')
      expect(wrapper.emitted('update:open')).toBeUndefined()
    })

    it('reopens at half height after being expanded', async () => {
      const wrapper = mountSheet()
      await dragGrabber(wrapper, -300)

      await wrapper.setProps({ open: false })
      await wrapper.setProps({ open: true })

      expect(wrapper.get('[data-testid="sheet-content"]').attributes('style')).toContain('height: 56dvh')
    })

    it('suppresses the built-in corner close so it cannot collide with the panel header', () => {
      // Paired deliberately with the close-button tests above: `hide-close` is only defensible
      // because this component supplies its own close.
      const content = mountSheet().get('[data-testid="sheet-content"]')

      expect(Object.keys(content.attributes())).toContain('hide-close')
      expect(content.attributes('side')).toBe('bottom')
    })
  })
})
