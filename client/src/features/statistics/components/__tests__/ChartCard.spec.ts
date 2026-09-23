import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { Gauge } from '@lucide/vue'

import ChartCard from '../ChartCard.vue'
import ChartEmptyState from '../ChartEmptyState.vue'

const baseProps = { title: 'Freshness', icon: Gauge, colorIndex: 1, loading: false, empty: false }

describe('ChartCard', () => {
  it('marks an empty chart so the card can collapse to a row on phones', () => {
    const wrapper = mount(ChartCard, { props: { ...baseProps, empty: true, emptyTitle: 'No metadata fetched yet' } })

    expect(wrapper.find('[data-chart-empty-state]').exists()).toBe(true)
    expect(wrapper.classes()).toContain('has-[[data-chart-empty-state]]:min-h-0')
    expect(wrapper.text()).toContain('No metadata fetched yet')
  })

  it('flags a chart that does not apply so the grid can drop it, but not while it is loading', () => {
    const loading = mount(ChartCard, { props: { ...baseProps, loading: true, notApplicable: true } })
    const loaded = mount(ChartCard, { props: { ...baseProps, notApplicable: true } })

    expect(loading.attributes('data-chart-not-applicable')).toBeUndefined()
    expect(loaded.attributes('data-chart-not-applicable')).toBe('')
  })

  it('hides the drag grip on touch screens', () => {
    const wrapper = mount(ChartCard, { props: baseProps })
    expect(wrapper.get('.drag-handle').classes()).toContain('pointer-coarse:hidden')
  })
})

describe('ChartEmptyState', () => {
  it('can opt out of collapsing when it sits inside a panel with its own controls', () => {
    const wrapper = mount(ChartEmptyState, { props: { icon: Gauge, title: 'No sessions', collapsible: false } })
    expect(wrapper.attributes('data-chart-empty-state')).toBeUndefined()
  })
})
