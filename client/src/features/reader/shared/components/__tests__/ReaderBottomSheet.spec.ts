import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import ReaderBottomSheet from '../ReaderBottomSheet.vue'

const VIEWPORT_HEIGHT = 1000

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: () => {} })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT })
})

afterEach(() => {
  document.body.innerHTML = ''
})

function pointer(type: string, clientY: number, timeStamp: number) {
  const event = new MouseEvent(type, { bubbles: true, clientY })
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, timeStamp: { value: timeStamp } })
  return event
}

function touch(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const touches = type === 'touchend' ? [] : [{ clientX: 100, clientY }]
  Object.defineProperty(event, 'touches', { value: touches })
  return event
}

/** A phone fires both touch and pointer streams for one finger, so drive both on the same element. */
function slowDrag(target: Element, fromY: number, toY: number) {
  const steps = 10
  target.dispatchEvent(touch('touchstart', fromY))
  target.dispatchEvent(pointer('pointerdown', fromY, 0))
  for (let step = 1; step <= steps; step += 1) {
    const y = fromY + ((toY - fromY) * step) / steps
    target.dispatchEvent(touch('touchmove', y))
    target.dispatchEvent(pointer('pointermove', y, step * 200))
  }
  target.dispatchEvent(touch('touchend', toY))
  target.dispatchEvent(pointer('pointerup', toY, steps * 200))
}

function sheetElement() {
  const el = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')
  if (!el) throw new Error('sheet content not rendered')
  return el
}

describe('ReaderBottomSheet', () => {
  it('moves a slow drag from full to peek instead of dismissing through the shared swipe', async () => {
    const wrapper = mount(ReaderBottomSheet, {
      props: { open: true, label: 'Contents', snap: 'full' },
      slots: { default: '<p>Body</p>' },
      attachTo: document.body,
    })
    await wrapper.vm.$nextTick()
    Object.defineProperty(sheetElement(), 'offsetHeight', { configurable: true, value: 920 })

    const grabber = document.querySelector('[data-sheet-grabber]')!
    slowDrag(grabber, 100, 400)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:snap')).toEqual([['peek']])
    expect(wrapper.emitted('update:open')).toBeUndefined()
    expect(sheetElement().style.transform).toBe('')
    wrapper.unmount()
  })

  it('leaves the shared swipe dismiss on for plain bottom sheets', async () => {
    const open = ref(true)
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(Sheet, { open: open.value, 'onUpdate:open': (value: boolean) => (open.value = value) }, () =>
            h(SheetContent, { side: 'bottom' }, () => h('p', { 'data-testid': 'body' }, 'Body')),
          ),
      }),
      { attachTo: document.body },
    )
    await wrapper.vm.$nextTick()
    Object.defineProperty(sheetElement(), 'offsetHeight', { configurable: true, value: 400 })

    slowDrag(document.querySelector('[data-testid="body"]')!, 100, 400)
    await wrapper.vm.$nextTick()

    expect(open.value).toBe(false)
    wrapper.unmount()
  })
})
