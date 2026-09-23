<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Trophy } from '@lucide/vue'
import PageTitleRow from '@/components/page-header/PageTitleRow.vue'
import type { FilterState } from '../types'

const { t } = useI18n()

const props = defineProps<{
  activeFilter: FilterState
  totalEarned: number
  totalAvailable: number
  counts: Record<FilterState, number>
}>()

const emit = defineEmits<{
  change: [filter: FilterState]
}>()

const FILTERS: Array<{ id: FilterState; label: string }> = [
  { id: 'all', label: 'achievements.filters.all' },
  { id: 'earned', label: 'achievements.filters.earned' },
  { id: 'in-progress', label: 'achievements.filters.inProgress' },
  { id: 'locked', label: 'achievements.filters.locked' },
]

function handleSelect(filter: FilterState): void {
  emit('change', filter)
}

function pillClass(filter: FilterState): string {
  return props.activeFilter === filter
    ? 'bg-primary/15 text-foreground shadow-sm ring-1 ring-primary/20'
    : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
}
</script>

<template>
  <PageTitleRow :eyebrow="t('components.sidebar.zones.reading')" :title="t('achievements.title')" :icon="Trophy">
    <template #facts>
      <span class="tabular-nums">{{ t('achievements.tiersEarnedFact', { earned: totalEarned, total: totalAvailable }) }}</span>
    </template>
    <template #inline>
      <div class="w-full sm:w-auto">
        <div
          class="grid grid-cols-4 sm:inline-flex items-center gap-1 rounded-lg bg-muted p-1"
          role="group"
          :aria-label="t('achievements.filters.label')"
        >
          <button
            v-for="filter in FILTERS"
            :key="filter.id"
            type="button"
            :class="[
              'min-h-11 shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors max-sm:px-2.5 max-sm:text-[13px]',
              pillClass(filter.id),
            ]"
            :aria-pressed="activeFilter === filter.id"
            @click="handleSelect(filter.id)"
          >
            {{ t(filter.label) }}
            <span class="ms-0.5 tabular-nums" :class="activeFilter === filter.id ? 'text-foreground' : 'text-muted-foreground'">{{
              counts[filter.id]
            }}</span>
          </button>
        </div>
      </div>
    </template>
  </PageTitleRow>
</template>
