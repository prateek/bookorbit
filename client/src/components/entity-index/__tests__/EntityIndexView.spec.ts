import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EntityIndexView from '../EntityIndexView.vue'
import type { EntityIndexItem } from '../EntityIndexView.vue'

function mountView(items: EntityIndexItem[]) {
  return mount(EntityIndexView, {
    props: {
      title: 'Libraries',
      titleIcon: 'BookCopy',
      items,
      routeName: 'library',
      fallbackIcon: 'BookCopy',
      searchPlaceholder: 'Filter libraries...',
      emptyTitle: 'No libraries yet',
      emptyHint: 'Create a library to start adding books.',
    },
    global: {
      stubs: {
        RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
        Popover: { name: 'Popover', template: '<div><slot /></div>' },
        PopoverTrigger: { name: 'PopoverTrigger', template: '<button type="button"><slot /></button>' },
        PopoverContent: { name: 'PopoverContent', template: '<div><slot /></div>' },
      },
    },
  })
}

function makeItem(overrides: Partial<EntityIndexItem>): EntityIndexItem {
  return { id: 1, displayOrder: 0, name: 'Library', icon: null, ...overrides }
}

describe('EntityIndexView', () => {
  describe('counts', () => {
    it('describes a book library by its book count', () => {
      const wrapper = mountView([makeItem({ type: 'books', bookCount: 7 })])

      expect(wrapper.text()).toContain('7 books')
    })

    it('describes a podcast library by its show count, which is not a book count', () => {
      const wrapper = mountView([makeItem({ type: 'podcasts', bookCount: 0, podcastCount: 2 })])

      expect(wrapper.text()).toContain('2 shows')
      expect(wrapper.text()).not.toContain('0 books')
    })

    it('omits the count line for an entity that carries no count', () => {
      const wrapper = mountView([makeItem({ name: 'Scope' })])

      expect(wrapper.find('[data-testid="entity-index-meta"]').exists()).toBe(false)
    })

    it('sorts podcast libraries against book libraries by their own counts', async () => {
      const wrapper = mountView([
        makeItem({ id: 1, displayOrder: 0, name: 'Novels', type: 'books', bookCount: 1 }),
        makeItem({ id: 2, displayOrder: 1, name: 'Podcasts', type: 'podcasts', bookCount: 0, podcastCount: 5 }),
      ])

      const sortByCount = wrapper.findAll('button').find((button) => button.text() === 'Book count')
      if (!sortByCount) throw new Error('Expected a book count sort option')
      await sortByCount.trigger('click')

      expect(wrapper.findAll('a').map((link) => link.text())).toEqual(['Novels 1 book', 'Podcasts 5 shows'])
    })
  })

  describe('reading signal', () => {
    it('leads a scope row with its unread count and counts its series', () => {
      const wrapper = mountView([makeItem({ name: 'Following', bookCount: 2024, seriesCount: 23, unreadCount: 37 })])

      const meta = wrapper.get('[data-testid="entity-index-meta"]')
      expect(meta.get('strong').text()).toBe('37 unread')
      expect(meta.text()).toContain('23 series · 2,024 books')
    })

    it('says a scope is all read rather than showing zero unread', () => {
      const wrapper = mountView([makeItem({ bookCount: 12, seriesCount: 1, unreadCount: 0 })])

      expect(wrapper.get('[data-testid="entity-index-meta"] strong').text()).toBe('All read')
    })

    it('calls the books of a library that counts a series as one book chapters', () => {
      const wrapper = mountView([makeItem({ type: 'books', bookCount: 4331, countSeriesAsOneBook: true })])

      expect(wrapper.text()).toContain('4,331 chapters')
    })
  })

  describe('toolbar', () => {
    it('hides the filter field for a short list', () => {
      const wrapper = mountView([makeItem({ id: 1, name: 'One' }), makeItem({ id: 2, name: 'Two' })])

      expect(wrapper.find('input[type="text"]').exists()).toBe(false)
    })

    it('offers the filter field once the list is long enough to need it', async () => {
      const items = Array.from({ length: 9 }, (_, index) => makeItem({ id: index + 1, displayOrder: index, name: `Scope ${index + 1}` }))
      const wrapper = mountView(items)

      await wrapper.get('input[type="text"]').setValue('Scope 9')

      expect(wrapper.findAll('a').map((link) => link.text())).toEqual(['Scope 9'])
    })

    it('labels the add button so it can collapse to an icon on phones', () => {
      const wrapper = mount(EntityIndexView, {
        props: {
          title: 'Collections',
          titleIcon: 'FolderOpen',
          items: [],
          routeName: 'collection',
          fallbackIcon: 'FolderOpen',
          searchPlaceholder: 'Filter',
          emptyTitle: 'None',
          emptyHint: 'Hint',
          canAdd: true,
          addLabel: 'New Collection',
        },
        global: { stubs: { RouterLink: true } },
      })

      expect(wrapper.get('[data-testid="entity-index-add"]').attributes('aria-label')).toBe('New Collection')
    })
  })
})
