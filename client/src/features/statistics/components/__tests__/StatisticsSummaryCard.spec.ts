import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const summaries = vi.hoisted(() => ({
  library: vi.fn<() => unknown>(),
  user: vi.fn<() => unknown>(),
}))

vi.mock('../../composables/useStatisticsSummary', () => ({ useStatisticsSummary: summaries.library }))
vi.mock('../../composables/useUserStatisticsSummary', () => ({ useUserStatisticsSummary: summaries.user }))

import StatisticsSummaryCard from '../StatisticsSummaryCard.vue'

summaries.library.mockImplementation(() => ({
  data: ref({
    totalBooks: 4331,
    totalAuthors: 7,
    totalSeries: 38,
    totalPublishers: 0,
    totalStorageBytes: 1024,
    totalGenres: 0,
    totalLanguages: 1,
    publicationYearMin: null,
    publicationYearMax: null,
    booksAddedThisYear: 4331,
  }),
  loading: ref(false),
}))
summaries.user.mockImplementation(() => ({
  data: ref({ trackedBooks: 400, startedBooks: 380, inProgressBooks: 40, completedBooks: 340, meanProgressPercent: 88.25 }),
  loading: ref(false),
}))

function tileKeys(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-tile]').map((tile) => tile.attributes('data-tile'))
}

describe('StatisticsSummaryCard', () => {
  it('shows only personal numbers on My Reading and fetches only those', () => {
    summaries.library.mockClear()
    const wrapper = mount(StatisticsSummaryCard, { props: { tab: 'user' } })

    expect(tileKeys(wrapper)).toEqual(['inProgress', 'completed', 'started', 'avgProgress'])
    expect(wrapper.text()).toContain('340')
    expect(wrapper.text()).not.toContain('4,331')
    expect(summaries.library).not.toHaveBeenCalled()
  })

  it('shows library totals on Library Stats without the personal tiles', () => {
    summaries.user.mockClear()
    const wrapper = mount(StatisticsSummaryCard, { props: { tab: 'library' } })

    expect(tileKeys(wrapper)).toContain('series')
    expect(tileKeys(wrapper)).not.toContain('started')
    expect(summaries.user).not.toHaveBeenCalled()
  })

  it('lays tiles out as a two-column grid on phones, capped at six, instead of a hidden-scrollbar strip', () => {
    const wrapper = mount(StatisticsSummaryCard, { props: { tab: 'library' } })

    expect(wrapper.get('ul').classes()).toContain('grid-cols-2')
    expect(wrapper.find('.overflow-x-auto').exists()).toBe(false)
    const phoneTiles = wrapper.findAll('[data-tile]').filter((tile) => !tile.classes().includes('max-sm:hidden'))
    expect(phoneTiles).toHaveLength(6)
  })
})
