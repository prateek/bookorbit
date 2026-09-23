import { mount } from '@vue/test-utils'
import { computed, defineComponent, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReaderHeader from '../ReaderHeader.vue'
import { READER_PAGE_CONTEXT } from '../../composables/readerPageContext'

const viewport = vi.hoisted(() => ({ isCompact: false }))

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()
  const { computed } = await import('vue')
  return { ...actual, useMediaQuery: () => computed(() => viewport.isCompact) }
})

const PopoverStub = defineComponent({
  name: 'SettingsPopover',
  emits: ['update:open'],
  template: '<div><slot /></div>',
})

const SheetStub = defineComponent({
  name: 'SettingsSheet',
  props: { open: { type: Boolean, default: false } },
  emits: ['update:open'],
  template: '<div><slot /></div>',
})

const global = {
  stubs: {
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
    Popover: PopoverStub,
    PopoverTrigger: { template: '<div><slot /></div>' },
    PopoverContent: { template: '<div><slot /></div>' },
    ReaderSettingsSheet: SheetStub,
  },
}

function stubFullscreenSupport(supported: boolean) {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: supported })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: supported ? vi.fn<() => Promise<void>>() : undefined })
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: supported ? vi.fn<() => Promise<void>>() : undefined,
  })
}

function mountHeader(props: Record<string, unknown> = {}) {
  return mount(ReaderHeader, {
    props: {
      chapterTitle: 'Chapter 4',
      isBookmarked: false,
      settingsOpen: false,
      footerMode: 0,
      ...props,
    },
    slots: { settingsPanel: '<p data-testid="settings-panel">Panel body</p>' },
    global,
  })
}

describe('ReaderHeader', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'fullscreenEnabled')
    Reflect.deleteProperty(document, 'exitFullscreen')
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
  })

  it('emits main toolbar actions', async () => {
    stubFullscreenSupport(true)
    const wrapper = mountHeader()
    await nextTick()

    await wrapper.get('button[aria-label="Go back"]').trigger('click')
    await wrapper.get('button[aria-label="Table of contents"]').trigger('click')
    await wrapper.get('button[aria-label="Toggle bookmark"]').trigger('click')
    await wrapper.get('button[aria-label="Search"]').trigger('click')
    await wrapper.get('button[aria-label="Cycle footer info mode"]').trigger('click')
    await wrapper.get('button[aria-label="Keyboard Shortcuts"]').trigger('click')
    await wrapper.get('button[aria-label="Enter fullscreen"]').trigger('click')
    await wrapper.get('button[aria-label="Toggle tap zones"]').trigger('click')
    await wrapper.get('button[aria-label="Pin menu"]').trigger('click')

    expect(wrapper.emitted('back')?.length).toBe(1)
    expect(wrapper.emitted('toggleSidebar')?.length).toBe(1)
    expect(wrapper.emitted('toggleBookmark')?.length).toBe(1)
    expect(wrapper.emitted('toggleSearch')?.length).toBe(1)
    expect(wrapper.emitted('cycleFooterMode')?.length).toBe(1)
    expect(wrapper.emitted('toggleHelp')?.length).toBe(1)
    expect(wrapper.emitted('toggleFullscreen')?.length).toBe(1)
    expect(wrapper.get('button[aria-label="Enter fullscreen"]').classes()).not.toContain('hidden')
    expect(wrapper.emitted('toggleTapZones')?.length).toBe(1)
    expect(wrapper.emitted('togglePin')?.length).toBe(1)
  })

  describe('settings container', () => {
    it('anchors settings to a popover on wide viewports', () => {
      viewport.isCompact = false
      const wrapper = mountHeader({ settingsOpen: true })

      expect(wrapper.findComponent(PopoverStub).exists()).toBe(true)
      expect(wrapper.findComponent(SheetStub).exists()).toBe(false)

      wrapper.findComponent(PopoverStub).vm.$emit('update:open', false)
      expect(wrapper.emitted('update:settingsOpen')?.[0]).toEqual([false])
    })

    it('drops settings into a bottom sheet on compact viewports', async () => {
      viewport.isCompact = true
      const wrapper = mountHeader()

      expect(wrapper.findComponent(SheetStub).exists()).toBe(true)
      expect(wrapper.findComponent(PopoverStub).exists()).toBe(false)

      await wrapper.get('button[aria-label="Reader settings"]').trigger('click')
      expect(wrapper.emitted('update:settingsOpen')?.[0]).toEqual([true])

      wrapper.findComponent(SheetStub).vm.$emit('update:open', false)
      expect(wrapper.emitted('update:settingsOpen')?.[1]).toEqual([false])

      viewport.isCompact = false
    })

    it('renders the settings panel inside the compact sheet', () => {
      viewport.isCompact = true
      const wrapper = mountHeader({ settingsOpen: true })

      expect(wrapper.findComponent(SheetStub).find('[data-testid="settings-panel"]').exists()).toBe(true)

      viewport.isCompact = false
    })

    it('forwards the open state to the compact sheet', async () => {
      viewport.isCompact = true
      const wrapper = mountHeader()
      expect(wrapper.findComponent(SheetStub).props('open')).toBe(false)

      await wrapper.setProps({ settingsOpen: true })
      expect(wrapper.findComponent(SheetStub).props('open')).toBe(true)

      viewport.isCompact = false
    })

    it('toggles rather than only opening when the compact trigger is pressed', async () => {
      // The compact trigger used to hard-set `true`, so it could never take the panel back down.
      // The wide path gets this for free from PopoverTrigger; the compact path has to do it itself.
      viewport.isCompact = true
      const wrapper = mountHeader({ settingsOpen: true })

      await wrapper.get('button[aria-label="Reader settings"]').trigger('click')

      expect(wrapper.emitted('update:settingsOpen')?.[0]).toEqual([false])

      viewport.isCompact = false
    })
  })

  it('hides TTS control when unavailable for current format', () => {
    const wrapper = mount(ReaderHeader, {
      props: {
        chapterTitle: 'Chapter 4',
        isBookmarked: true,
        settingsOpen: false,
        footerMode: 0,
        isTtsAvailable: false,
      },
      global,
    })

    expect(wrapper.find('button[aria-label="Listen with TTS"]').exists()).toBe(false)
  })

  it('hides the fullscreen control where the browser cannot go fullscreen', async () => {
    stubFullscreenSupport(false)
    const wrapper = mountHeader()
    await nextTick()

    expect(wrapper.find('button[aria-label="Enter fullscreen"]').exists()).toBe(false)
  })

  it('keeps the chapter title in the bar on phones', () => {
    viewport.isCompact = true
    const wrapper = mountHeader({ chapterTitle: 'Chapter 1287: The Tower' })

    const title = wrapper.findAll('p').find((p) => p.text() === 'Chapter 1287: The Tower')
    expect(title?.exists()).toBe(true)
    expect(title?.element.parentElement?.className).not.toMatch(/(^|\s)hidden(\s|$)/)

    viewport.isCompact = false
  })

  it('takes its colors from the page theme when the reader provides one', () => {
    const mode = ref({ fg: '#5b4636', bg: '#f1e8d0', link: '#008b8b' })
    const wrapper = mount(ReaderHeader, {
      props: { chapterTitle: 'Chapter 4', isBookmarked: false, settingsOpen: false, footerMode: 0 },
      slots: { settingsPanel: '<p />' },
      global: {
        ...global,
        provide: { [READER_PAGE_CONTEXT as symbol]: { mode: computed(() => mode.value), flow: ref('paginated') } },
      },
    })

    const style = wrapper.get('header').attributes('style') ?? ''
    expect(style).toContain('--background: #f1e8d0')
    expect(style).toContain('--foreground: #5b4636')
  })

  it('marks itself as reader chrome so auto-hide can pause while it is in use', () => {
    const wrapper = mountHeader()

    expect(wrapper.get('header').attributes()).toHaveProperty('data-reader-chrome')
  })

  it('labels the tap-zone and pin buttons through i18n', () => {
    const pinned = mountHeader({ isPinned: true })

    expect(pinned.find('[aria-label="Toggle tap zones"]').exists()).toBe(true)
    expect(pinned.find('[aria-label="Unpin menu"]').exists()).toBe(true)
    expect(mountHeader({ isPinned: false }).find('[aria-label="Pin menu"]').exists()).toBe(true)
  })
})
