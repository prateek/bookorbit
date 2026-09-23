import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { filterUsesSeriesFollowing, notifySeriesFollowChanged, onSeriesFollowChangedWhileAway } from './useSeriesFollowChanges'

function mountKeptAliveHost(reload: () => void) {
  const Cached = defineComponent({
    name: 'CachedView',
    setup() {
      onSeriesFollowChangedWhileAway(reload)
      return () => h('div', 'cached')
    },
  })
  const Other = defineComponent({ name: 'OtherView', render: () => h('div', 'other') })
  const showCached = ref(true)
  const wrapper = mount(
    defineComponent({
      setup: () => () => h(KeepAlive, null, [showCached.value ? h(Cached) : h(Other)]),
    }),
  )
  return { wrapper, showCached }
}

describe('useSeriesFollowChanges', () => {
  it('reloads a kept-alive view on return after a follow change, once', async () => {
    const reload = vi.fn<() => void>()
    const { showCached } = mountKeptAliveHost(reload)
    expect(reload).not.toHaveBeenCalled()

    showCached.value = false
    await nextTick()
    notifySeriesFollowChanged()
    showCached.value = true
    await nextTick()
    expect(reload).toHaveBeenCalledOnce()

    showCached.value = false
    await nextTick()
    showCached.value = true
    await nextTick()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not reload on return when nothing changed', async () => {
    const reload = vi.fn<() => void>()
    const { showCached } = mountKeptAliveHost(reload)

    showCached.value = false
    await nextTick()
    showCached.value = true
    await nextTick()

    expect(reload).not.toHaveBeenCalled()
  })

  it('detects the series-following rule anywhere in a filter', () => {
    expect(filterUsesSeriesFollowing(undefined)).toBe(false)
    expect(filterUsesSeriesFollowing({ type: 'group', join: 'and', rules: [{ field: 'title', operator: 'contains', value: 'x' }] })).toBe(false)
    expect(
      filterUsesSeriesFollowing({
        type: 'group',
        join: 'and',
        rules: [{ type: 'group', join: 'or', rules: [{ field: 'seriesFollowing', operator: 'isFalse' }] }],
      }),
    ).toBe(true)
  })
})
