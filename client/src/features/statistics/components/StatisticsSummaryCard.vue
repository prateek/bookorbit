<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatNumber } from '@/i18n/formatters'
import { formatBytes } from '@/lib/formatting'
import { BarChart3, BookCheck, BookOpen, BookText, Building2, CalendarPlus, CalendarRange, Globe, Layers, Tags, Users } from '@lucide/vue'

import { useStatisticsSummary } from '../composables/useStatisticsSummary'
import { useUserStatisticsSummary } from '../composables/useUserStatisticsSummary'

interface SummaryTile {
  icon: Component
  key: string
  label: string
  value: string
  colorIndex: number
  /** Phones show a two-column grid of the first few tiles; the rest only appear with room to spare. */
  phone: boolean
}

const props = defineProps<{ tab: 'library' | 'user' }>()

const { t } = useI18n()

// Each tab mounts its own summary, so only the numbers that tab shows are fetched.
const library = props.tab === 'library' ? useStatisticsSummary() : null
const user = props.tab === 'user' ? useUserStatisticsSummary() : null

const ICON_HUE_OFFSETS = [0, 45, 90, 135, 180, 225, 270, 315, 337]

function iconStyle(colorIndex: number) {
  const offset = ICON_HUE_OFFSETS[(colorIndex - 1) % ICON_HUE_OFFSETS.length] ?? 0
  const color = `oklch(from var(--primary) l c calc(h + ${offset}))`
  return { backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`, color }
}

function count(value: number | undefined): string {
  return value == null ? '-' : formatNumber(value)
}

const loading = computed(() => (library ? library.loading.value : (user?.loading.value ?? false)))

const libraryTiles = computed<SummaryTile[]>(() => {
  const data = library?.data.value
  const min = data?.publicationYearMin
  const max = data?.publicationYearMax
  const published = !min && !max ? '-' : min === max ? String(min) : `${min} - ${max}`
  return [
    { icon: BookOpen, key: 'books', label: t('statistics.summary.books'), value: count(data?.totalBooks), colorIndex: 1, phone: true },
    { icon: Layers, key: 'series', label: t('statistics.summary.series'), value: count(data?.totalSeries), colorIndex: 3, phone: true },
    { icon: Users, key: 'authors', label: t('statistics.summary.authors'), value: count(data?.totalAuthors), colorIndex: 2, phone: true },
    {
      icon: CalendarPlus,
      key: 'thisYear',
      label: t('statistics.summary.thisYear'),
      value: count(data?.booksAddedThisYear),
      colorIndex: 9,
      phone: true,
    },
    {
      icon: BarChart3,
      key: 'storage',
      label: t('statistics.summary.storage'),
      value: data ? formatBytes(data.totalStorageBytes) : '-',
      colorIndex: 5,
      phone: true,
    },
    { icon: Tags, key: 'genres', label: t('statistics.summary.genres'), value: count(data?.totalGenres), colorIndex: 6, phone: true },
    {
      icon: Building2,
      key: 'publishers',
      label: t('statistics.summary.publishers'),
      value: count(data?.totalPublishers),
      colorIndex: 4,
      phone: false,
    },
    { icon: Globe, key: 'languages', label: t('statistics.summary.languages'), value: count(data?.totalLanguages), colorIndex: 7, phone: false },
    { icon: CalendarRange, key: 'published', label: t('statistics.summary.published'), value: data ? published : '-', colorIndex: 8, phone: false },
  ]
})

const userTiles = computed<SummaryTile[]>(() => {
  const data = user?.data.value
  return [
    { icon: BookOpen, key: 'inProgress', label: t('statistics.summary.inProgress'), value: count(data?.inProgressBooks), colorIndex: 2, phone: true },
    { icon: BookCheck, key: 'completed', label: t('statistics.summary.completed'), value: count(data?.completedBooks), colorIndex: 3, phone: true },
    { icon: BookText, key: 'started', label: t('statistics.summary.started'), value: count(data?.startedBooks), colorIndex: 1, phone: true },
    {
      icon: BarChart3,
      key: 'avgProgress',
      label: t('statistics.summary.avgProgress'),
      value: data ? `${data.meanProgressPercent.toFixed(1)}%` : '-',
      colorIndex: 4,
      phone: true,
    },
  ]
})

const tiles = computed(() => (props.tab === 'library' ? libraryTiles.value : userTiles.value))
</script>

<template>
  <div class="relative overflow-hidden rounded-lg border bg-card">
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent" />
    <BarChart3 class="pointer-events-none absolute -right-0 -top-2 opacity-[0.04]" :size="100" aria-hidden="true" />

    <div class="relative p-3 sm:p-4">
      <ul class="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] sm:gap-3" :data-testid="`statistics-summary-${tab}`">
        <li
          v-for="(tile, index) in tiles"
          :key="tile.key"
          :data-tile="tile.key"
          :class="[
            'border-border/60 bg-background/50 flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 animate-fade-up sm:px-4',
            loading ? 'opacity-60' : '',
            tile.phone ? '' : 'max-sm:hidden',
          ]"
          :style="{ animationDelay: `${index * 50}ms` }"
        >
          <div class="shrink-0 rounded-md p-1.5" :style="iconStyle(tile.colorIndex)">
            <component :is="tile.icon" class="size-4" />
          </div>
          <div class="min-w-0">
            <p class="text-foreground truncate text-base font-semibold leading-tight tabular-nums">{{ tile.value }}</p>
            <p class="text-muted-foreground truncate text-[13px] sm:text-xs">{{ tile.label }}</p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
