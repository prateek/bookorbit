<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMediaQuery } from '@vueuse/core'
import { ArrowUpDown, Check, ChevronRight, Plus, Search, X } from '@lucide/vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import AppIcon from '@/components/AppIcon.vue'
import { formatNumber } from '@/i18n/formatters'
import { entityCount } from '@/lib/entity-count'

export interface EntityIndexItem {
  id: number
  displayOrder: number
  name: string
  icon?: string | null
  bookCount?: number | null
  podcastCount?: number | null
  type?: string
  /** Distinct series among the matching books, where the index knows it. */
  seriesCount?: number
  /** Matching books the viewer has not read, where the index knows it. */
  unreadCount?: number
  /** A library that counts a series as one book holds serial chapters, so its books are called chapters. */
  countSeriesAsOneBook?: boolean
}

type SortField = 'custom' | 'name' | 'bookCount'
type SortDirection = 'asc' | 'desc'

/** Below this many items a filter field costs more space than it saves. */
const FILTER_MIN_ITEMS = 9

const props = withDefaults(
  defineProps<{
    title: string
    titleIcon: string
    items: EntityIndexItem[]
    routeName: string
    fallbackIcon: string
    searchPlaceholder: string
    emptyTitle: string
    emptyHint: string
    loading?: boolean
    canAdd?: boolean
    addLabel?: string
    /** Indexes of non-book entities relabel the count sort to match what they actually count. */
    countSortLabel?: string
  }>(),
  { loading: false, canAdd: false, addLabel: undefined, countSortLabel: undefined },
)

const emit = defineEmits<{ add: [] }>()

const { t } = useI18n()
const isPhone = useMediaQuery('(max-width: 639px)')

const SORT_FIELDS: SortField[] = ['custom', 'name', 'bookCount']
const SORT_DIRECTIONS: SortDirection[] = ['asc', 'desc']

const query = ref('')
const sort = ref<SortField>('custom')
const order = ref<SortDirection>('asc')
const sortSheetOpen = ref(false)

const sortLabels = computed<Record<SortField, string>>(() => ({
  custom: t('components.entityIndex.sort.custom'),
  name: t('components.entityIndex.sort.name'),
  bookCount: props.countSortLabel ?? t('components.entityIndex.sort.bookCount'),
}))

const isDefaultSort = computed(() => sort.value === 'custom' && order.value === 'asc')
const isFiltering = computed(() => query.value.trim().length > 0)
const showFilter = computed(() => props.items.length >= FILTER_MIN_ITEMS || isFiltering.value)
const showSort = computed(() => props.items.length > 1)

const matchedItems = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return props.items
  return props.items.filter((item) => item.name.toLocaleLowerCase().includes(needle))
})

const sortedItems = computed(() => {
  const direction = order.value === 'asc' ? 1 : -1
  const field = sort.value
  return [...matchedItems.value].sort((a, b) => {
    if (field === 'name') return a.name.localeCompare(b.name) * direction
    if (field === 'bookCount') return ((entityCount(a) ?? 0) - (entityCount(b) ?? 0)) * direction
    return (a.displayOrder - b.displayOrder) * direction
  })
})

const resultSummary = computed(() =>
  isFiltering.value
    ? t('components.entityIndex.resultCount', { shown: formatNumber(sortedItems.value.length), total: formatNumber(props.items.length) })
    : formatNumber(props.items.length),
)

function setSortField(field: SortField) {
  sort.value = field
  order.value = 'asc'
}

function setSortOrder(direction: SortDirection) {
  order.value = direction
}

function resetSort() {
  sort.value = 'custom'
  order.value = 'asc'
}

function clearQuery() {
  query.value = ''
}

function handleAdd() {
  emit('add')
}

function openSortSheet() {
  sortSheetOpen.value = true
}

function itemRoute(id: number) {
  return { name: props.routeName, params: { id } }
}

type ItemMeta = { unread: string | null; details: string }

/**
 * What a row says under its name. Where the viewer's unread count is known it leads, because
 * "what is new for me here" is the reason to open a scope; the series count follows so a scope
 * of serial chapters reads in serials rather than in thousands of books.
 */
function itemMeta(item: EntityIndexItem): ItemMeta | null {
  const count = entityCount(item)
  if (count === null) return null
  if (item.type === 'podcasts') return { unread: null, details: t('components.entityIndex.showCount', { count }) }

  const parts: string[] = []
  if (item.seriesCount) parts.push(t('components.entityIndex.seriesCount', { count: item.seriesCount }))
  parts.push(item.countSeriesAsOneBook ? t('components.entityIndex.chapterCount', { count }) : t('components.entityIndex.bookCount', { count }))

  let unread: string | null = null
  if (item.unreadCount !== undefined && count > 0) {
    unread = item.unreadCount > 0 ? t('components.entityIndex.unreadCount', { count: item.unreadCount }) : t('components.entityIndex.allRead')
  }
  return { unread, details: parts.join(' · ') }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <AppIcon :icon="titleIcon" :fallback="fallbackIcon" :size="18" class="shrink-0 text-primary" />
        <h1 class="min-w-0 truncate text-lg font-semibold text-foreground">{{ title }}</h1>
        <span class="shrink-0 text-sm text-muted-foreground tabular-nums">{{ resultSummary }}</span>
      </div>

      <div class="flex shrink-0 items-center gap-1 sm:order-2 sm:gap-2">
        <!-- Phones get an icon that opens a bottom sheet; the labelled popover trigger does not fit beside the title. -->
        <button
          v-if="showSort && isPhone"
          type="button"
          data-testid="entity-index-sort-sheet-trigger"
          class="flex size-11 items-center justify-center rounded-md transition-colors"
          :class="!isDefaultSort ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
          :aria-label="t('components.entityIndex.sortAria', { sort: sortLabels[sort] })"
          @click="openSortSheet"
        >
          <ArrowUpDown :size="18" aria-hidden="true" />
        </button>

        <Popover v-else-if="showSort">
          <PopoverTrigger
            class="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm transition-colors"
            :class="!isDefaultSort ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground hover:bg-muted'"
          >
            <ArrowUpDown :size="13" aria-hidden="true" />
            <span>{{ sortLabels[sort] }}</span>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-56 p-2">
            <div class="mb-2 px-1 text-xs font-medium text-muted-foreground">{{ t('components.entityIndex.sortBy') }}</div>
            <div class="flex flex-col gap-0.5">
              <button
                v-for="field in SORT_FIELDS"
                :key="field"
                class="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                :class="sort === field ? 'font-medium text-foreground' : 'text-muted-foreground'"
                @click="setSortField(field)"
              >
                {{ sortLabels[field] }}
                <span v-if="sort === field" class="text-xs text-primary">{{ order === 'asc' ? '↑' : '↓' }}</span>
              </button>
            </div>
            <div class="my-2 border-t border-border" />
            <div class="flex gap-1">
              <button
                v-for="direction in SORT_DIRECTIONS"
                :key="direction"
                class="flex-1 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                :class="order === direction ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'"
                @click="setSortOrder(direction)"
              >
                {{ direction === 'asc' ? t('components.entityIndex.ascending') : t('components.entityIndex.descending') }}
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <button
          v-if="!isDefaultSort && !isPhone"
          class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          :aria-label="t('common.resetSortAria')"
          @click="resetSort"
        >
          <X :size="13" aria-hidden="true" />
        </button>

        <button
          v-if="canAdd"
          type="button"
          data-testid="entity-index-add"
          class="flex size-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:h-8 sm:w-auto sm:px-3"
          :aria-label="addLabel"
          @click="handleAdd"
        >
          <Plus :size="18" class="sm:size-[13px]" aria-hidden="true" />
          <span class="hidden sm:inline">{{ addLabel }}</span>
        </button>
      </div>

      <div
        v-if="showFilter"
        class="order-last flex h-11 w-full items-center gap-1.5 rounded-md border border-input bg-background px-3 sm:order-1 sm:h-8 sm:w-64 sm:px-2.5"
      >
        <Search :size="14" aria-hidden="true" class="shrink-0 text-muted-foreground" />
        <label class="sr-only" :for="`entity-index-search-${routeName}`">{{ searchPlaceholder }}</label>
        <input
          :id="`entity-index-search-${routeName}`"
          v-model="query"
          type="text"
          :placeholder="searchPlaceholder"
          class="h-full w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          v-if="isFiltering"
          class="touch-target shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          :aria-label="t('components.entityIndex.clearSearch')"
          @click="clearQuery"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
    </div>

    <main class="min-h-0 flex-1 overflow-y-auto sm:pr-2">
      <div v-if="loading && items.length === 0" class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        <div v-for="index in 12" :key="`skeleton-${index}`" class="h-16 animate-pulse rounded-lg bg-muted/50 sm:h-24" />
      </div>

      <div v-else-if="sortedItems.length === 0" class="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <p class="text-sm font-medium text-foreground">{{ isFiltering ? t('components.entityIndex.noMatches') : emptyTitle }}</p>
        <p class="text-xs text-muted-foreground">{{ isFiltering ? t('components.entityIndex.noMatchesHint') : emptyHint }}</p>
      </div>

      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 sm:gap-3">
        <RouterLink
          v-for="item in sortedItems"
          :key="item.id"
          :to="itemRoute(item.id)"
          class="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <AppIcon :icon="item.icon || fallbackIcon" :fallback="fallbackIcon" :size="18" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="truncate text-base font-medium text-foreground sm:text-sm">{{ item.name }}</span>
            <span v-if="itemMeta(item)" class="text-[13px] text-muted-foreground tabular-nums sm:text-xs" data-testid="entity-index-meta">
              <template v-if="itemMeta(item)!.unread">
                <strong class="font-semibold text-foreground">{{ itemMeta(item)!.unread }}</strong>
                <span aria-hidden="true"> · </span>
              </template>
              {{ itemMeta(item)!.details }}
            </span>
          </span>
          <ChevronRight :size="16" aria-hidden="true" class="shrink-0 text-muted-foreground sm:hidden" />
        </RouterLink>
      </div>
    </main>

    <Sheet v-if="isPhone" v-model:open="sortSheetOpen">
      <SheetContent side="bottom" class="rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{{ t('components.entityIndex.sortBy') }}</SheetTitle>
          <SheetDescription class="sr-only">{{ t('components.entityIndex.sortBy') }}</SheetDescription>
        </SheetHeader>
        <div class="flex flex-col px-2" role="radiogroup" :aria-label="t('components.entityIndex.sortBy')">
          <button
            v-for="field in SORT_FIELDS"
            :key="field"
            type="button"
            role="radio"
            :aria-checked="sort === field"
            class="flex min-h-12 items-center justify-between rounded-md px-3 text-base transition-colors active:bg-muted"
            :class="sort === field ? 'font-medium text-foreground' : 'text-muted-foreground'"
            @click="setSortField(field)"
          >
            {{ sortLabels[field] }}
            <Check v-if="sort === field" :size="18" class="text-primary" aria-hidden="true" />
          </button>
        </div>
        <div class="mx-4 mt-2 grid grid-cols-2 gap-2">
          <button
            v-for="direction in SORT_DIRECTIONS"
            :key="direction"
            type="button"
            class="h-11 whitespace-nowrap rounded-md border text-sm transition-colors"
            :class="order === direction ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-input text-muted-foreground'"
            :aria-pressed="order === direction"
            @click="setSortOrder(direction)"
          >
            {{ direction === 'asc' ? t('components.entityIndex.ascending') : t('components.entityIndex.descending') }}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>
