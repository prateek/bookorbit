import { defineComponent, h, KeepAlive, nextTick, ref, type Ref } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSeriesRunSlot } from './useSeriesRunSlot'

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ path: '/series/42' }),
}))

enableAutoUnmount(afterEach)

function onEntry(position: number, { returning = false } = {}) {
  window.history.replaceState({ position, forward: returning ? '/read/301/1' : null }, '')
}

function mountKeptAliveSlot(firstIndex: Ref<number>) {
  const saved: Array<number | null> = []
  const Series = defineComponent({
    name: 'SeriesDetailView',
    setup() {
      saved.push(useSeriesRunSlot(firstIndex).savedRunStart)
      return () => h('div', 'series')
    },
  })
  const Other = defineComponent({ name: 'OtherView', render: () => h('div', 'other') })
  const showSeries = ref(true)
  const wrapper = mount(
    defineComponent({
      setup: () => () => h(KeepAlive, null, [showSeries.value ? h(Series) : h(Other)]),
    }),
  )
  return { wrapper, showSeries, saved }
}

function savedRunStartOn(position: number): number | null {
  onEntry(position, { returning: true })
  const { saved } = mountKeptAliveSlot(ref(0))
  return saved[0] ?? null
}

describe('useSeriesRunSlot', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    window.history.replaceState(null, '')
  })

  it('gives a returning entry the run start it was left on', async () => {
    onEntry(1)
    const firstIndex = ref(0)
    const { wrapper, saved } = mountKeptAliveSlot(firstIndex)
    firstIndex.value = 300
    await nextTick()
    wrapper.unmount()

    expect(saved).toEqual([null])
    expect(savedRunStartOn(1)).toBe(300)
  })

  it('keeps the saved run when the page is left again before it is rebuilt', async () => {
    onEntry(1)
    const firstIndex = ref(300)
    mountKeptAliveSlot(firstIndex).wrapper.unmount()

    onEntry(1, { returning: true })
    const { wrapper, saved } = mountKeptAliveSlot(ref(0))
    await nextTick()
    wrapper.unmount()

    expect(saved).toEqual([300])
    expect(savedRunStartOn(1)).toBe(300)
  })

  it('has nothing for an entry it never saw', () => {
    expect(savedRunStartOn(1)).toBeNull()
  })

  it('saves against the newer entry when a kept-alive view is shown on it', async () => {
    onEntry(1)
    const firstIndex = ref(300)
    const { wrapper, showSeries } = mountKeptAliveSlot(firstIndex)
    showSeries.value = false
    await nextTick()

    onEntry(3)
    showSeries.value = true
    await nextTick()
    wrapper.unmount()

    expect(savedRunStartOn(3)).toBe(300)
  })
})
