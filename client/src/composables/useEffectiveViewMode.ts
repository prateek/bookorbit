import { computed } from 'vue'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { useDisplaySettings, type BookViewMode } from '@/composables/useDisplaySettings'

export function useEffectiveViewMode() {
  const { viewMode } = useDisplaySettings()
  const { md } = useBreakpoints(breakpointsTailwind)

  // Phones cannot fit the table, and a user who picked table wants density, so list is the closest match.
  const effectiveViewMode = computed<BookViewMode>(() => {
    if (!md.value && viewMode.value === 'table') return 'list'
    return viewMode.value
  })

  return { viewMode, effectiveViewMode }
}
