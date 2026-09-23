import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SelectionPopup from '../SelectionPopup.vue'

const globalStubs = {
  stubs: {
    teleport: true,
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
  },
}

describe('SelectionPopup', () => {
  it('copies selected text to clipboard and emits copy after feedback delay', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const wrapper = mount(SelectionPopup, {
      props: {
        visible: true,
        position: { x: 100, y: 200 },
        showBelow: false,
        selectedText: 'Important quote',
        overlappingAnnotationId: null,
        isTtsAvailable: true,
      },
      global: globalStubs,
    })

    await wrapper.findAll('button')[0]!.trigger('click')
    await vi.runAllTicks()

    expect(writeText).toHaveBeenCalledWith('Important quote')
    // copy is not emitted yet — waiting for the 1500ms feedback window
    expect(wrapper.emitted('copy')).toBeUndefined()

    await vi.runAllTimersAsync()

    expect(wrapper.emitted('copy')?.length).toBe(1)
    vi.useRealTimers()
  })

  it('emits highlight from picker apply and from second highlight click', async () => {
    const wrapper = mount(SelectionPopup, {
      props: {
        visible: true,
        position: { x: 100, y: 200 },
        showBelow: false,
        selectedText: 'Text',
        overlappingAnnotationId: null,
        isTtsAvailable: true,
      },
      global: globalStubs,
    })

    const highlightButton = wrapper.findAll('button')[1]!
    await highlightButton.trigger('click')

    expect(wrapper.text()).toContain('Apply')

    await wrapper.get('button[class*="flex-1"]').trigger('click')
    expect(wrapper.emitted('highlight')?.[0]).toEqual(['#FACC15', 'highlight'])

    await highlightButton.trigger('click')
    await highlightButton.trigger('click')
    expect(wrapper.emitted('highlight')?.[1]).toEqual(['#FACC15', 'highlight'])
  })

  it('shows KOReader-equivalent highlight colors in the picker', async () => {
    const wrapper = mount(SelectionPopup, {
      props: {
        visible: true,
        position: { x: 100, y: 200 },
        showBelow: false,
        selectedText: 'Text',
        overlappingAnnotationId: null,
        isTtsAvailable: false,
      },
      global: globalStubs,
    })

    const highlightButton = wrapper.findAll('button')[1]!
    await highlightButton.trigger('click')

    expect(wrapper.text()).toContain('Red')
    expect(wrapper.text()).toContain('Olive')
    expect(wrapper.text()).toContain('Cyan')
    expect(wrapper.text()).toContain('Purple')
    expect(wrapper.text()).toContain('Gray')
  })

  it('shows delete action only when overlapping annotation exists', async () => {
    const withDelete = mount(SelectionPopup, {
      props: {
        visible: true,
        position: { x: 100, y: 200 },
        showBelow: false,
        selectedText: 'Text',
        overlappingAnnotationId: 55,
        isTtsAvailable: false,
      },
      global: globalStubs,
    })

    const withoutDelete = mount(SelectionPopup, {
      props: {
        visible: true,
        position: { x: 100, y: 200 },
        showBelow: false,
        selectedText: 'Text',
        overlappingAnnotationId: null,
        isTtsAvailable: false,
      },
      global: globalStubs,
    })

    expect(withDelete.findAll('button').length).toBeGreaterThan(withoutDelete.findAll('button').length)

    const deleteButtons = withDelete.findAll('button')
    const deleteButton = deleteButtons[deleteButtons.length - 1]
    await deleteButton?.trigger('click')

    expect(withDelete.emitted('deleteAnnotation')?.[0]).toEqual([55])
  })

  describe('viewport clamping', () => {
    const originalInnerWidth = window.innerWidth

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    })

    function mountAt(x: number) {
      return mount(SelectionPopup, {
        props: {
          visible: true,
          position: { x, y: 200 },
          showBelow: true,
          selectedText: 'text',
          overlappingAnnotationId: null,
          isTtsAvailable: true,
        },
        global: globalStubs,
      })
    }

    function leftOf(wrapper: ReturnType<typeof mountAt>) {
      const style = wrapper.get('.fixed.z-\\[60\\]').attributes('style') ?? ''
      return Number(/left: (-?[\d.]+)px/.exec(style)?.[1])
    }

    it('keeps a toolbar anchored near the left edge fully on screen', () => {
      expect(leftOf(mountAt(20))).toBe(8)
    })

    it('keeps a toolbar anchored near the right edge fully on screen', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 402 })

      const left = leftOf(mountAt(395))

      expect(left + 296).toBeLessThanOrEqual(402 - 8)
    })

    it('centers on the selection when there is room', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })

      expect(leftOf(mountAt(600))).toBe(600 - 296 / 2)
    })
  })
})
