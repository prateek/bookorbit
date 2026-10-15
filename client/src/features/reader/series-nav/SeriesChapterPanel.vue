<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, Circle, CircleDot } from '@lucide/vue'
import type { BookCard } from '@bookorbit/types'
import { chapterReadState, type ChapterReadState } from '@/features/series/lib/series-chapter'
import { seriesChapterTarget, type SeriesChapterTarget } from './series-chapter-panel'
import { useSeriesChapters } from './useSeriesChapters'

const props = defineProps<{
  seriesId: number
  bookId: number
  navigationLocked?: boolean
}>()

const emit = defineEmits<{
  open: [target: SeriesChapterTarget]
}>()

const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const { items, seriesName, loading, loadingEarlier, loadingLater, failed, hasEarlier, hasLater, load, loadEarlier, loadLater } = useSeriesChapters(
  props.seriesId,
  props.bookId,
)

const STATE_ICONS: Record<ChapterReadState, typeof Circle> = { read: CheckCircle2, reading: CircleDot, unread: Circle }
const STATE_CLASSES: Record<ChapterReadState, string> = {
  read: 'text-success',
  reading: 'text-warning',
  unread: 'text-muted-foreground',
}

function isCurrent(book: BookCard): boolean {
  return book.id === props.bookId
}

function stateOf(book: BookCard): ChapterReadState {
  return chapterReadState(book)
}

function stateLabel(book: BookCard): string {
  return t(`series.detail.chapterState.${stateOf(book)}`)
}

function canOpen(book: BookCard): boolean {
  if (props.navigationLocked) return false
  return isCurrent(book) || seriesChapterTarget(book) !== null
}

function rowElement(bookId: number): HTMLElement | null {
  return root.value?.querySelector<HTMLElement>(`[data-book-id="${bookId}"]`) ?? null
}

function openChapter(book: BookCard) {
  if (props.navigationLocked || isCurrent(book)) return
  const target = seriesChapterTarget(book)
  if (target) emit('open', target)
}

async function loadAroundCurrent() {
  await load()
  await nextTick()
  rowElement(props.bookId)?.scrollIntoView?.({ block: 'center' })
}

async function showEarlier() {
  const firstId = items.value[0]?.id
  await loadEarlier()
  await nextTick()
  // Keeps the chapter the reader was looking at in place as the earlier ones arrive above it.
  if (firstId !== undefined) rowElement(firstId)?.scrollIntoView?.({ block: 'start' })
}

async function showLater() {
  await loadLater()
}

onMounted(loadAroundCurrent)
</script>

<template>
  <div ref="root" data-testid="series-chapter-panel">
    <p v-if="seriesName" class="truncate px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {{ seriesName }}
    </p>
    <div v-if="loading && items.length === 0" class="px-4 py-8 text-center text-sm text-muted-foreground">
      {{ t('reader.sidebar.seriesChapters.loading') }}
    </div>
    <div v-else-if="failed" class="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
      <p>{{ t('reader.sidebar.seriesChapters.loadFailed') }}</p>
      <button type="button" class="rounded-md px-3 py-1.5 text-primary hover:bg-muted/50 pointer-coarse:min-h-11" @click="loadAroundCurrent">
        {{ t('reader.retry') }}
      </button>
    </div>
    <template v-else>
      <button
        v-if="hasEarlier"
        type="button"
        class="w-full px-4 py-2 text-left text-[13px] text-primary transition-colors hover:bg-muted/50 disabled:opacity-60 pointer-coarse:min-h-11"
        :disabled="loadingEarlier"
        data-testid="series-chapters-earlier"
        @click="showEarlier"
      >
        {{ t('reader.sidebar.seriesChapters.earlier') }}
      </button>
      <ol class="py-1">
        <li v-for="book in items" :key="book.id" :data-book-id="book.id">
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] leading-snug transition-colors pointer-coarse:min-h-11"
            :class="[
              isCurrent(book) ? 'bg-primary/8 font-medium text-primary ring-1 ring-inset ring-primary/25' : 'hover:bg-muted/50',
              canOpen(book) ? '' : 'cursor-not-allowed opacity-60 hover:bg-transparent',
            ]"
            :aria-current="isCurrent(book) ? 'location' : undefined"
            :disabled="!canOpen(book)"
            data-testid="series-chapter-panel-row"
            @click="openChapter(book)"
          >
            <span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {{ book.seriesIndex != null ? `#${book.seriesIndex}` : '' }}
            </span>
            <span class="min-w-0 flex-1 truncate" :class="!isCurrent(book) && stateOf(book) === 'read' ? 'text-muted-foreground' : ''">
              {{ book.title ?? t('series.detail.untitled') }}
            </span>
            <component
              :is="STATE_ICONS[stateOf(book)]"
              :size="14"
              class="shrink-0"
              :class="STATE_CLASSES[stateOf(book)]"
              :aria-label="stateLabel(book)"
            />
          </button>
        </li>
      </ol>
      <button
        v-if="hasLater"
        type="button"
        class="w-full px-4 py-2 text-left text-[13px] text-primary transition-colors hover:bg-muted/50 disabled:opacity-60 pointer-coarse:min-h-11"
        :disabled="loadingLater"
        data-testid="series-chapters-later"
        @click="showLater"
      >
        {{ t('reader.sidebar.seriesChapters.later') }}
      </button>
    </template>
  </div>
</template>
