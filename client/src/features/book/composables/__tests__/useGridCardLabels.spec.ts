import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const cannotHover = ref(false)
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()
  return { ...actual, useMediaQuery: () => cannotHover }
})

import { useDisplaySettings } from '@/composables/useDisplaySettings'
import { useGridCardLabels } from '../useGridCardLabels'

describe('useGridCardLabels', () => {
  const settings = useDisplaySettings()

  afterEach(() => {
    cannotHover.value = false
    settings.cardInfoMode.value = 'hover-overlay'
    settings.gridCardPrimaryLabel.value = 'hidden'
    settings.gridCardSecondaryLabel.value = 'hidden'
  })

  it('keeps the saved settings on hover-capable devices', () => {
    const labels = useGridCardLabels()
    expect(labels.effectiveCardInfoMode.value).toBe('hover-overlay')
    expect(labels.effectivePrimaryLabel.value).toBe('hidden')
  })

  it('shows title and series position below the cover on touch devices', () => {
    cannotHover.value = true
    const labels = useGridCardLabels()
    expect(labels.effectiveCardInfoMode.value).toBe('below-cover')
    expect(labels.effectivePrimaryLabel.value).toBe('book-title')
    expect(labels.effectiveSecondaryLabel.value).toBe('series-title-position')
  })

  it('keeps label fields the user chose on touch devices', () => {
    cannotHover.value = true
    settings.gridCardPrimaryLabel.value = 'author'
    const labels = useGridCardLabels()
    expect(labels.effectivePrimaryLabel.value).toBe('author')
  })

  it('does not override an explicit below-cover choice with hidden labels', () => {
    cannotHover.value = true
    settings.cardInfoMode.value = 'below-cover'
    const labels = useGridCardLabels()
    expect(labels.touchLabelFallback.value).toBe(false)
    expect(labels.effectivePrimaryLabel.value).toBe('hidden')
  })
})
