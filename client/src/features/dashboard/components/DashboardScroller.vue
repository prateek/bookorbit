<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import { useI18n } from 'vue-i18n'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { Aperture, BookMarked, BookmarkPlus, ChevronLeft, ChevronRight, Headphones, ListOrdered, RefreshCw, Shuffle, Sparkles } from '@lucide/vue'

import type { BookCard, BookScrollerType } from '@bookorbit/types'
import BookCoverCard from '@/features/book/components/BookCoverCard.vue'
import BookQuickView from '@/features/book/components/BookQuickView.vue'
import AddToCollectionSheet from '@/features/collection/components/AddToCollectionSheet.vue'
import DeleteBookDialog from '@/features/book/components/DeleteBookDialog.vue'
import { useDashboardScroller } from '../composables/useDashboardScroller'
import { useDeleteBook } from '@/features/book/composables/useDeleteBook'
import { hasUniformFormat } from '@/features/book/lib/uniform-format'
import { MIN_SHELF_ROWS, chunkIntoBands, effectiveShelfRows, shelfBookLimit } from '../lib/shelf-rows'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  type: BookScrollerType
  title: string
  limit?: number
  rows?: number
  smartScopeId?: number
}>()

const attrs = useAttrs()
const { t } = useI18n()

const DEFAULT_BOOKS_PER_ROW = 20

const { sm } = useBreakpoints(breakpointsTailwind)
const shelfRows = computed(() => effectiveShelfRows(props.rows ?? MIN_SHELF_ROWS, !sm.value))

// Snapshotted at setup so resizing across the breakpoint re-flows the books
// already fetched instead of firing another batch request.
const { books, loading, error, refresh } = useDashboardScroller(
  props.type,
  shelfBookLimit(props.limit ?? DEFAULT_BOOKS_PER_ROW, shelfRows.value),
  props.smartScopeId,
)

const bands = computed(() => chunkIntoBands(books.value, shelfRows.value))
const hideFormatBadges = computed(() => hasUniformFormat(books.value))
const isEmpty = computed(() => !loading.value && !error.value && books.value.length === 0)

const emptyMessage = computed(() => {
  if (props.type === 'continue-reading') return t('dashboard.scroller.empty.continueReading')
  if (props.type === 'continue-listening') return t('dashboard.scroller.empty.continueListening')
  if (props.type === 'want-to-read') return t('dashboard.scroller.empty.wantToRead')
  if (props.type === 'up-next-in-series') return t('dashboard.scroller.empty.upNextInSeries')
  if (props.type === 'recently-added') return t('dashboard.scroller.empty.recentlyAdded')
  if (props.type === 'smart-scope') return t('dashboard.scroller.empty.smartScope')
  return t('dashboard.scroller.empty.default')
})

const scrollEl = ref<HTMLElement | null>(null)

function scrollBy(delta: number) {
  scrollEl.value?.scrollBy({ left: delta, behavior: 'smooth' })
}

const typeIcon = computed(() => {
  if (props.type === 'continue-reading') return BookMarked
  if (props.type === 'continue-listening') return Headphones
  if (props.type === 'want-to-read') return BookmarkPlus
  if (props.type === 'up-next-in-series') return ListOrdered
  if (props.type === 'recently-added') return Sparkles
  if (props.type === 'smart-scope') return Aperture
  return Shuffle
})

const SKELETONS_PER_BAND = 8
const skeletonBands = computed(() => Array.from({ length: shelfRows.value }, () => Array.from({ length: SKELETONS_PER_BAND })))
const PORTRAIT_COVER_WIDTH_CLASS = 'w-[120px]'
const SQUARE_COVER_WIDTH_CLASS = 'w-[150px]'

// 'move-to-library' is part of the shared card contract; this view does not
// opt in, so it never fires here.
type BookActionType = 'quick-view' | 'edit-metadata' | 'add-to-collection' | 'move-to-library' | 'delete'

const quickViewBookId = ref<number | null>(null)
const quickViewOpen = ref(false)

const addToCollectionOpen = ref(false)
const addToCollectionBookId = ref<number | null>(null)

const {
  pendingId: deleteBookId,
  deleting: deletingBook,
  promptDelete,
  cancelDelete,
  confirmDelete,
} = useDeleteBook((id) => {
  books.value = books.value.filter((b) => b.id !== id)
})

function handleBookAction(book: BookCard, action: BookActionType) {
  if (action === 'quick-view') {
    quickViewBookId.value = book.id
    quickViewOpen.value = true
    return
  }
  if (action === 'add-to-collection') {
    addToCollectionBookId.value = book.id
    addToCollectionOpen.value = true
    return
  }
  if (action === 'delete') {
    promptDelete(book.id)
  }
}

function coverWidthClass(book: BookCard): string {
  return book.coverAspectRatio === '1/1' ? SQUARE_COVER_WIDTH_CLASS : PORTRAIT_COVER_WIDTH_CLASS
}

function coverAnimationDelay(index: number): string {
  return `${index * 35}ms`
}

// A recently added card can stand for several new entries of one series; the cover alone does not
// say so, so the count sits under it on every screen.
function newEntryCount(book: BookCard): number {
  return book.collapsedSeries?.bookCount ?? 0
}

// Bands align cards at the bottom, so the count line is reserved on every card of a shelf that
// shows one; otherwise folded covers sit a line higher than their neighbours.
const reservesNewCountLine = computed(() => books.value.some((book) => newEntryCount(book) > 1))

function newCountVisibilityClass(book: BookCard): string {
  return newEntryCount(book) > 1 ? '' : 'invisible'
}
</script>

<template>
  <section v-bind="attrs" class="group/scroller overflow-hidden rounded-2xl border border-primary/40 bg-card/30 shadow-sm backdrop-blur-[1px]">
    <!-- Header; an empty shelf collapses to this single line -->
    <div class="flex items-center justify-between px-5" :class="isEmpty ? 'py-3' : 'mb-2 pt-4'">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
          <component :is="typeIcon" :size="14" class="text-foreground" />
        </div>
        <h2 class="shrink-0 text-[15px] font-bold tracking-tight">{{ title }}</h2>
        <span
          v-if="!loading && !error && books.length > 0"
          class="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-foreground"
        >
          {{ books.length }}
        </span>
        <p
          v-if="isEmpty"
          data-testid="shelf-empty"
          class="w-full min-w-0 truncate ps-9.5 text-xs text-muted-foreground sm:w-auto sm:flex-1 sm:ps-0 sm:text-sm"
        >
          {{ emptyMessage }}
        </p>
      </div>
      <div v-if="!isEmpty" class="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/scroller:opacity-100">
        <button
          class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="scrollBy(-560)"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="scrollBy(560)"
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="flex flex-col gap-5 overflow-hidden px-5 pb-5">
      <div v-for="(skeletonBand, bandIndex) in skeletonBands" :key="bandIndex" class="flex gap-3">
        <div v-for="(_, n) in skeletonBand" :key="n" class="w-[120px] shrink-0">
          <div class="w-full animate-pulse rounded-lg bg-muted" style="aspect-ratio: 2/3" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex items-center gap-2.5 px-5 pb-4 pt-1 text-sm text-muted-foreground">
      <span>{{ t('dashboard.scroller.failedToLoad') }}</span>
      <button class="flex items-center gap-1.5 text-xs text-primary hover:underline" @click="refresh">
        <RefreshCw :size="12" />
        {{ t('dashboard.common.retry') }}
      </button>
    </div>

    <!-- Books rows -->
    <div v-else-if="!isEmpty" ref="scrollEl" class="overflow-x-auto px-5 pb-5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div class="flex w-max flex-col gap-5">
        <div v-for="(band, bandIndex) in bands" :key="bandIndex" data-testid="shelf-band" class="flex items-end gap-5">
          <div
            v-for="(book, index) in band"
            :key="book.id"
            class="shrink-0"
            :class="coverWidthClass(book)"
            style="animation: dashboardFadeUp 0.35s ease both"
            :style="{ animationDelay: coverAnimationDelay(index) }"
          >
            <BookCoverCard
              :book="book"
              :cover-aspect-ratio="book.coverAspectRatio"
              :show-label="true"
              :hide-format-badge="hideFormatBadges"
              @action="handleBookAction(book, $event)"
            />
            <p
              v-if="reservesNewCountLine"
              class="mt-1 h-4 truncate text-[11px] font-semibold leading-4 text-primary"
              :class="newCountVisibilityClass(book)"
              data-testid="shelf-card-new-count"
            >
              <template v-if="newEntryCount(book) > 1">{{ t('dashboard.scroller.newInSeries', { count: newEntryCount(book) }) }}</template>
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <BookQuickView :book-id="quickViewBookId" :open="quickViewOpen" @update:open="quickViewOpen = $event" />

  <AddToCollectionSheet
    :open="addToCollectionOpen"
    :selection-payload="{ bookIds: addToCollectionBookId ? [addToCollectionBookId] : [] }"
    :selected-count="addToCollectionBookId ? 1 : 0"
    @update:open="addToCollectionOpen = $event"
  />

  <DeleteBookDialog :open="deleteBookId !== null" :deleting="deletingBook" @confirm="confirmDelete" @cancel="cancelDelete" />
</template>

<style scoped>
@keyframes dashboardFadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
