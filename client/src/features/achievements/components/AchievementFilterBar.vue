<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Medal, Trophy } from '@lucide/vue'
import type { FilterState } from '../types'

const { t } = useI18n()

const props = defineProps<{
  activeFilter: FilterState
  totalEarned: number
  totalAvailable: number
  earnedCount: number
  inProgressCount: number
  lockedCount: number
}>()

const emit = defineEmits<{
  change: [filter: FilterState]
}>()

function handleAll(): void {
  emit('change', 'all')
}

function handleEarned(): void {
  emit('change', 'earned')
}

function handleInProgress(): void {
  emit('change', 'in-progress')
}

function handleLocked(): void {
  emit('change', 'locked')
}

const pillBase =
  'flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1 text-[13px] leading-tight font-medium transition-colors sm:flex-row sm:px-3 sm:py-1.5 sm:text-sm pointer-fine:sm:min-h-0'

const totalCount = computed(() => props.earnedCount + props.lockedCount)

function pillClass(filter: FilterState): string {
  return props.activeFilter === filter
    ? 'bg-primary/15 text-foreground shadow-sm ring-1 ring-primary/20'
    : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
}
</script>

<template>
  <div class="relative overflow-hidden rounded-lg border border-border/60 bg-muted/35 p-2">
    <Medal class="pointer-events-none absolute right-0 top-0 text-muted-foreground opacity-[0.05]" :size="72" aria-hidden="true" />

    <div class="relative flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="flex min-w-0 shrink-0 items-center gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-background/60">
          <Trophy class="size-6 text-primary" />
        </div>
        <div class="min-w-0">
          <h1 class="text-base font-semibold tracking-tight text-foreground sm:text-md">{{ t('achievements.title') }}</h1>
          <span class="text-muted-foreground text-sm tabular-nums">{{
            t('achievements.tiersCount', { earned: totalEarned, total: totalAvailable })
          }}</span>
        </div>
      </div>

      <div class="bg-border h-px w-full sm:h-8 sm:w-px" />

      <div class="grid grid-cols-4 gap-1 rounded-md border border-border/50 bg-background/70 p-1 sm:inline-flex sm:w-auto sm:items-center">
        <button type="button" :aria-pressed="activeFilter === 'all'" :class="[pillBase, pillClass('all')]" @click="handleAll">
          <span>{{ t('achievements.filter.all') }}</span>
          <span class="text-xs tabular-nums opacity-70 sm:hidden">{{ totalCount }}</span>
        </button>
        <button type="button" :aria-pressed="activeFilter === 'earned'" :class="[pillBase, pillClass('earned')]" @click="handleEarned">
          <span class="sm:hidden">{{ t('achievements.filter.earnedShort') }}</span>
          <span class="text-xs tabular-nums opacity-70 sm:hidden">{{ earnedCount }}</span>
          <span class="max-sm:hidden">{{ t('achievements.filter.earned', { count: earnedCount }) }}</span>
        </button>
        <button type="button" :aria-pressed="activeFilter === 'in-progress'" :class="[pillBase, pillClass('in-progress')]" @click="handleInProgress">
          <span class="sm:hidden">{{ t('achievements.filter.inProgressShort') }}</span>
          <span class="text-xs tabular-nums opacity-70 sm:hidden">{{ inProgressCount }}</span>
          <span class="max-sm:hidden">{{ t('achievements.filter.inProgress', { count: inProgressCount }) }}</span>
        </button>
        <button type="button" :aria-pressed="activeFilter === 'locked'" :class="[pillBase, pillClass('locked')]" @click="handleLocked">
          <span class="sm:hidden">{{ t('achievements.filter.lockedShort') }}</span>
          <span class="text-xs tabular-nums opacity-70 sm:hidden">{{ lockedCount }}</span>
          <span class="max-sm:hidden">{{ t('achievements.filter.locked', { count: lockedCount }) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
