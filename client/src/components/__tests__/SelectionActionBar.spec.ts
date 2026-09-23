import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import SelectionActionBar from '../SelectionActionBar.vue'

const permissionState = {
  allowed: new Set<string>(),
  demoRestricted: false,
}

vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (name: string) => permissionState.allowed.has(name),
    isDemoRestrictedAccount: {
      get value() {
        return permissionState.demoRestricted
      },
    },
  }),
}))

vi.mock('@/features/book/composables/useMetadataFieldSearch', () => ({
  usePublisherSearch: () => ({ search: vi.fn<(query: string) => Promise<string[]>>().mockResolvedValue([]) }),
  useSeriesNameSearch: () => ({ search: vi.fn<(query: string) => Promise<string[]>>().mockResolvedValue([]) }),
  useLanguageSearch: () => ({ search: vi.fn<(query: string) => Promise<string[]>>().mockResolvedValue([]) }),
}))

const globalStubs = {
  stubs: {
    DropdownMenu: { template: '<div><slot /></div>' },
    DropdownMenuTrigger: { template: '<div><slot /></div>' },
    DropdownMenuContent: { template: '<div><slot /></div>' },
    DropdownMenuItem: { template: '<button><slot /></button>' },
    DropdownMenuSeparator: { template: '<div />' },
    DropdownMenuSub: { template: '<div><slot /></div>' },
    DropdownMenuSubTrigger: { template: '<button><slot /></button>' },
    DropdownMenuSubContent: { template: '<div><slot /></div>' },
    Tooltip: { template: '<div><slot /></div>' },
    TooltipTrigger: { template: '<div><slot /></div>' },
    TooltipContent: { template: '<div><slot /></div>' },
    TooltipProvider: { template: '<div><slot /></div>' },
  },
}

function mountBar() {
  return mount(SelectionActionBar, {
    props: {
      visible: true,
      count: 3,
      inCollection: false,
      inFlight: null,
    },
    global: globalStubs,
  })
}

describe('SelectionActionBar demo restriction', () => {
  beforeEach(() => {
    permissionState.allowed = new Set(['library_edit_metadata', 'library_download', 'email_send', 'library_delete_books'])
    permissionState.demoRestricted = false
  })

  it('shows bulk-edit controls for non-restricted accounts', async () => {
    const wrapper = mountBar()

    expect(wrapper.find('[data-testid="action-download-files"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-export-metadata"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-bulk-edit-metadata"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-edit-individually"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-bulk-set-status"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-bulk-set-rating"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-bulk-metadata-menu"]').exists()).toBe(true)

    expect(wrapper.find('[data-testid="action-bulk-refresh-metadata"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-bulk-re-extract-cover"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-bulk-lock-metadata"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-bulk-unlock-metadata"]').exists()).toBe(true)
  })

  it('hides edit-individually while the selection is query-scoped but keeps the bulk editor', () => {
    const wrapper = mount(SelectionActionBar, {
      props: { visible: true, count: 5000, inCollection: false, inFlight: null, queryScoped: true },
      global: globalStubs,
    })

    expect(wrapper.find('[data-testid="action-edit-individually"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-bulk-edit-metadata"]').exists()).toBe(true)
  })

  it('keeps metadata export available in the more menu with download-only permission', () => {
    permissionState.allowed = new Set(['library_download'])
    const wrapper = mountBar()

    expect(wrapper.find('[data-testid="action-download-files"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-bulk-metadata-menu"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-export-metadata"]').exists()).toBe(true)

    expect(wrapper.find('[data-testid="action-bulk-edit-metadata"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-bulk-refresh-metadata"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-bulk-re-extract-cover"]').exists()).toBe(false)
  })

  it('hides bulk-edit controls for demo-restricted accounts', () => {
    permissionState.demoRestricted = true
    const wrapper = mountBar()

    expect(wrapper.find('[data-testid="action-download-files"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-export-metadata"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-bulk-edit-metadata"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-bulk-set-status"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-bulk-set-rating"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-bulk-metadata-menu"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-add-to-collection"]').exists()).toBe(true)
  })

  it('emits add/send/download/metadata-export/status/rating actions from default controls', async () => {
    const wrapper = mountBar()

    await wrapper.find('[data-testid="action-add-to-collection"]').trigger('click')
    expect(wrapper.emitted('add-to-collection')).toHaveLength(1)

    await wrapper.find('[data-testid="action-edit-individually"]').trigger('click')
    expect(wrapper.emitted('edit-individually')).toHaveLength(1)

    await wrapper.find('[data-testid="action-send-email"]').trigger('click')
    await wrapper.find('[data-testid="action-export-metadata"]').trigger('click')
    await wrapper.find('[data-testid="action-download-files"]').trigger('click')
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Primary only')
      ?.trigger('click')
    expect(wrapper.emitted('send')).toHaveLength(1)
    expect(wrapper.emitted('export-metadata')).toHaveLength(1)
    expect(wrapper.emitted('download')?.[0]).toEqual(['primary'])

    await wrapper.find('[data-testid="action-bulk-set-status"]').trigger('click')
    await wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('Reading'))
      ?.trigger('click')
    expect(wrapper.emitted('set-status')?.[0]).toEqual(['reading'])

    await wrapper.find('[data-testid="action-bulk-set-rating"]').trigger('click')
    await nextTick()
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === '5')
      ?.trigger('click')
    expect(wrapper.emitted('set-rating')?.[0]).toEqual([5])
  })

  it('emits bulk metadata actions from Metadata menu', async () => {
    const wrapper = mountBar()

    await wrapper.find('[data-testid="action-bulk-refresh-metadata"]').trigger('click')
    await wrapper.find('[data-testid="action-bulk-re-extract-cover"]').trigger('click')
    await wrapper.find('[data-testid="action-bulk-lock-metadata"]').trigger('click')
    await wrapper.find('[data-testid="action-bulk-unlock-metadata"]').trigger('click')

    expect(wrapper.emitted('refresh-metadata')).toHaveLength(1)
    expect(wrapper.emitted('re-extract-cover')).toHaveLength(1)
    expect(wrapper.emitted('lock-metadata')?.map((args) => args[0])).toEqual([true, false])
  })

  it('emits set-field from the field editor flow', async () => {
    const wrapper = mountBar()
    await wrapper.find('[data-testid="action-bulk-set-field"]').trigger('click')
    await nextTick()

    const select = wrapper.find('select')
    const input = wrapper.find('input')
    await select.setValue('language')
    await input.setValue('fr')
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Apply')
      ?.trigger('click')

    expect(wrapper.emitted('set-field')?.[0]).toEqual(['language', 'fr'])
  })

  it('clears numeric fields when the field editor input is blank', async () => {
    const wrapper = mountBar()
    await wrapper.find('[data-testid="action-bulk-set-field"]').trigger('click')
    await nextTick()

    const select = wrapper.find('select')
    await select.setValue('publishedYear')
    await nextTick()
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Apply')
      ?.trigger('click')

    expect(wrapper.emitted('set-field')?.[0]).toEqual(['publishedYear', null])
  })

  it('emits list fields as deduplicated comma-separated values', async () => {
    const wrapper = mountBar()
    await wrapper.find('[data-testid="action-bulk-set-field"]').trigger('click')
    await nextTick()

    const select = wrapper.find('select')
    await select.setValue('authors')
    await nextTick()
    await wrapper.find('input').setValue(' Author A, Author B , Author A ')
    await wrapper
      .findAll('button')
      .find((btn) => btn.text() === 'Apply')
      ?.trigger('click')

    expect(wrapper.emitted('set-field')?.[0]).toEqual(['authors', ['Author A', 'Author B']])
  })

  it('requires DELETE confirmation text when count exceeds 50', async () => {
    const wrapper = mount(SelectionActionBar, {
      props: { visible: true, count: 75, inCollection: false, inFlight: null },
      global: globalStubs,
    })

    await wrapper.find('[data-testid="action-delete"]').trigger('click')
    await nextTick()

    const confirmButton = wrapper.findAll('button').find((btn) => btn.text() === 'Delete')
    expect(confirmButton?.attributes('disabled')).toBeDefined()

    const input = wrapper.find('input[placeholder="Type DELETE"]')
    await input.setValue('DELETE')
    await nextTick()
    expect(
      wrapper
        .findAll('button')
        .find((btn) => btn.text() === 'Delete')
        ?.attributes('disabled'),
    ).toBeUndefined()
  })

  describe('on a phone-width screen', () => {
    const originalMatchMedia = window.matchMedia

    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('max-width: 639px'),
        media: query,
        onchange: null,
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
        addListener: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
        dispatchEvent: vi.fn<() => boolean>(),
      })) as unknown as typeof window.matchMedia
    })

    afterEach(() => {
      window.matchMedia = originalMatchMedia
    })

    const sheetStubs = {
      stubs: {
        ...globalStubs.stubs,
        Sheet: { name: 'Sheet', props: ['open'], emits: ['update:open'], template: '<div v-if="open" data-testid="sheet-root"><slot /></div>' },
        SheetContent: { template: '<div v-bind="$attrs"><slot /></div>' },
        SheetHeader: { template: '<div><slot /></div>' },
        SheetFooter: { template: '<div><slot /></div>' },
        SheetTitle: { template: '<h2><slot /></h2>' },
        SheetDescription: { template: '<p><slot /></p>' },
      },
    }

    function mountPhoneBar(count: number) {
      return mount(SelectionActionBar, {
        props: { visible: true, count, inCollection: false, inFlight: null },
        global: sheetStubs,
      })
    }

    it('confirms deletes over 50 books in a bottom sheet instead of the inline row', async () => {
      const wrapper = mountPhoneBar(75)
      await nextTick()
      await wrapper.get('[data-testid="mobile-action-delete"]').trigger('click')
      await nextTick()

      const sheet = wrapper.get('[data-testid="delete-confirm-sheet"]')
      expect(sheet.text()).toContain('Delete 75 books?')
      expect(wrapper.find('[data-testid="selection-count"]').exists()).toBe(true)
      expect(wrapper.findAll('input[placeholder="Type DELETE"]')).toHaveLength(1)

      const input = wrapper.get('[data-testid="delete-confirm-sheet-input"]')
      expect(input.classes()).toEqual(expect.arrayContaining(['h-11', 'w-full', 'text-base']))
      for (const id of ['delete-confirm-sheet-delete', 'delete-confirm-sheet-cancel']) {
        expect(wrapper.get(`[data-testid="${id}"]`).classes()).toEqual(expect.arrayContaining(['h-11', 'w-full']))
      }

      const confirm = wrapper.get('[data-testid="delete-confirm-sheet-delete"]')
      expect(confirm.attributes('disabled')).toBeDefined()
      await confirm.trigger('click')
      expect(wrapper.emitted('delete')).toBeUndefined()

      await input.setValue('DELETE')
      await wrapper.get('[data-testid="delete-confirm-sheet-delete"]').trigger('click')
      expect(wrapper.emitted('delete')).toHaveLength(1)
      expect(wrapper.find('[data-testid="delete-confirm-sheet"]').exists()).toBe(false)
    })

    it('cancels from the sheet and clears the typed confirmation', async () => {
      const wrapper = mountPhoneBar(75)
      await nextTick()
      await wrapper.get('[data-testid="mobile-action-delete"]').trigger('click')
      await nextTick()
      await wrapper.get('[data-testid="delete-confirm-sheet-input"]').setValue('DEL')
      await wrapper.get('[data-testid="delete-confirm-sheet-cancel"]').trigger('click')
      await nextTick()

      expect(wrapper.find('[data-testid="delete-confirm-sheet"]').exists()).toBe(false)
      await wrapper.get('[data-testid="mobile-action-delete"]').trigger('click')
      await nextTick()
      expect((wrapper.get('[data-testid="delete-confirm-sheet-input"]').element as HTMLInputElement).value).toBe('')
      expect(wrapper.emitted('delete')).toBeUndefined()
    })

    it('confirms from the keyboard return key once DELETE is typed', async () => {
      const wrapper = mountPhoneBar(75)
      await nextTick()
      await wrapper.get('[data-testid="mobile-action-delete"]').trigger('click')
      await nextTick()

      const input = wrapper.get('[data-testid="delete-confirm-sheet-input"]')
      await input.trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('delete')).toBeUndefined()

      await input.setValue('DELETE')
      await input.trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('delete')).toHaveLength(1)
      expect(wrapper.find('[data-testid="delete-confirm-sheet"]').exists()).toBe(false)
    })

    it('treats dismissing the sheet as cancelling the delete', async () => {
      const wrapper = mountPhoneBar(75)
      await nextTick()
      await wrapper.get('[data-testid="mobile-action-delete"]').trigger('click')
      await nextTick()
      await wrapper.get('[data-testid="delete-confirm-sheet-input"]').setValue('DELETE')

      wrapper.getComponent({ name: 'Sheet' }).vm.$emit('update:open', false)
      await nextTick()

      expect(wrapper.find('[data-testid="delete-confirm-sheet"]').exists()).toBe(false)
      expect(wrapper.emitted('delete')).toBeUndefined()
      await wrapper.get('[data-testid="mobile-action-delete"]').trigger('click')
      await nextTick()
      expect((wrapper.get('[data-testid="delete-confirm-sheet-input"]').element as HTMLInputElement).value).toBe('')
    })

    it('keeps the short inline confirmation for 50 books or fewer', async () => {
      const wrapper = mountPhoneBar(3)
      await nextTick()
      await wrapper.get('[data-testid="mobile-action-delete"]').trigger('click')
      await nextTick()

      expect(wrapper.find('[data-testid="delete-confirm-sheet"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Delete 3 books?')
    })
  })

  it('keeps the inline typed confirmation on wide screens', async () => {
    const wrapper = mount(SelectionActionBar, {
      props: { visible: true, count: 75, inCollection: false, inFlight: null },
      global: globalStubs,
    })
    await wrapper.find('[data-testid="action-delete"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="delete-confirm-sheet"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="selection-count"]').exists()).toBe(false)
    expect(wrapper.find('input[placeholder="Type DELETE"]').exists()).toBe(true)
  })

  it('resets transient menu state when visibility is turned off', async () => {
    const wrapper = mountBar()
    await wrapper.find('[data-testid="action-bulk-set-field"]').trigger('click')
    await nextTick()
    expect(wrapper.find('select').exists()).toBe(true)

    await wrapper.setProps({ visible: false })
    await nextTick()
    await wrapper.setProps({ visible: true })
    await nextTick()

    expect(wrapper.find('[data-testid="action-bulk-metadata-menu"]').exists()).toBe(true)
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('toggles select all when the host supports it', async () => {
    const wrapper = mount(SelectionActionBar, {
      props: { visible: true, count: 3, canSelectAll: true, allSelected: false },
      global: globalStubs,
    })
    const toggle = wrapper.get('[data-testid="action-toggle-select-all"]')
    expect(toggle.attributes('aria-label')).toBe('Select all')

    await toggle.trigger('click')
    expect(wrapper.emitted('toggle-select-all')?.[0]).toEqual([true])

    await wrapper.setProps({ allSelected: true })
    expect(wrapper.get('[data-testid="action-toggle-select-all"]').attributes('aria-label')).toBe('Deselect all')
    await wrapper.get('[data-testid="action-toggle-select-all"]').trigger('click')
    expect(wrapper.emitted('toggle-select-all')?.[1]).toEqual([false])
  })

  it('hides select all for hosts that cannot enumerate their books', () => {
    const wrapper = mountBar()
    expect(wrapper.find('[data-testid="action-toggle-select-all"]').exists()).toBe(false)
  })

  it('keeps count, status, more and exit visible on phones and moves the rest into More', () => {
    const wrapper = mountBar()
    const phoneHidden = (testId: string) => wrapper.get(`[data-testid="${testId}"]`).classes().includes('hidden')

    expect(phoneHidden('action-bulk-set-status')).toBe(false)
    expect(phoneHidden('action-mobile-more')).toBe(false)
    expect(phoneHidden('action-exit-selection')).toBe(false)
    expect(phoneHidden('action-add-to-collection')).toBe(true)
    expect(phoneHidden('action-delete')).toBe(true)
    expect(wrapper.get('[data-testid="action-exit-selection"]').classes()).toContain('h-11')
  })

  it('offers delete from the phone More menu', async () => {
    const wrapper = mountBar()
    await wrapper.get('[data-testid="mobile-action-delete"]').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Delete 3 books?')
  })

  it('labels every icon-only button', () => {
    const wrapper = mountBar()
    const unlabeled = wrapper
      .findAll('button')
      .filter((btn) => btn.text().trim() === '' && !btn.attributes('aria-label'))
      .map((btn) => btn.attributes('data-testid'))
    expect(unlabeled).toEqual([])
  })
})
