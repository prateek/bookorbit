import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useDisplaySettings, type CardInfoMode, type GridCardLabelField } from '@/composables/useDisplaySettings'

/**
 * Grid card label settings as they apply on this device. Touch screens cannot hover, so the
 * hover-overlay mode would hide every title; there the card falls back to a below-cover label
 * showing the title and series position unless the user picked other label fields.
 */
export function useGridCardLabels() {
  const { cardInfoMode, gridCardPrimaryLabel, gridCardSecondaryLabel } = useDisplaySettings()
  const cannotHover = useMediaQuery('(hover: none)')

  const touchLabelFallback = computed(() => cannotHover.value && cardInfoMode.value === 'hover-overlay')

  const effectiveCardInfoMode = computed<CardInfoMode>(() => (touchLabelFallback.value ? 'below-cover' : cardInfoMode.value))
  const effectivePrimaryLabel = computed<GridCardLabelField>(() =>
    touchLabelFallback.value && gridCardPrimaryLabel.value === 'hidden' ? 'book-title' : gridCardPrimaryLabel.value,
  )
  const effectiveSecondaryLabel = computed<GridCardLabelField>(() =>
    touchLabelFallback.value && gridCardSecondaryLabel.value === 'hidden' ? 'series-title-position' : gridCardSecondaryLabel.value,
  )

  return { touchLabelFallback, effectiveCardInfoMode, effectivePrimaryLabel, effectiveSecondaryLabel }
}
