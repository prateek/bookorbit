<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { CheckCircle2, Circle, CircleDot } from '@lucide/vue'
import type { SeriesBookRecommendation } from '@bookorbit/types'

import { decodeHtmlEntities } from '@/features/book/lib/display-text'

type ChapterState = 'read' | 'reading' | 'unread'

const props = defineProps<{
  books: SeriesBookRecommendation[]
  currentBookId: number
}>()

const { t } = useI18n()

const ROWS_BEFORE = 2
const ROW_COUNT = 6

const STATE_ICONS: Record<ChapterState, typeof Circle> = { read: CheckCircle2, reading: CircleDot, unread: Circle }
const STATE_CLASSES: Record<ChapterState, string> = {
  read: 'text-success',
  reading: 'text-warning',
  unread: 'text-muted-foreground',
}

/** The chapters around the current one: two before it and the rest after, kept full near either end. */
const visibleBooks = computed(() => {
  const index = props.books.findIndex((book) => book.id === props.currentBookId)
  if (index === -1) return props.books.slice(0, ROW_COUNT)
  const start = Math.max(0, Math.min(index - ROWS_BEFORE, props.books.length - ROW_COUNT))
  return props.books.slice(start, start + ROW_COUNT)
})

function isCurrent(book: SeriesBookRecommendation): boolean {
  return book.id === props.currentBookId
}

function stateOf(book: SeriesBookRecommendation): ChapterState {
  const status = book.readStatus?.status
  if (status === 'read') return 'read'
  if (status === 'reading' || status === 'rereading') return 'reading'
  return 'unread'
}

function stateLabel(book: SeriesBookRecommendation): string {
  return t(`series.detail.chapterState.${stateOf(book)}`)
}

function titleOf(book: SeriesBookRecommendation): string {
  return decodeHtmlEntities(book.title) ?? t('book.detail.details.untitled')
}
</script>

<template>
  <ol class="-mx-2 divide-y divide-border/60" data-test="series-chapter-strip">
    <li v-for="book in visibleBooks" :key="book.id" :data-book-id="book.id">
      <component
        :is="isCurrent(book) ? 'div' : RouterLink"
        :to="isCurrent(book) ? undefined : { name: 'book-detail', params: { bookId: book.id } }"
        :replace="isCurrent(book) ? undefined : true"
        :aria-current="isCurrent(book) ? 'page' : undefined"
        class="flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5"
        :class="isCurrent(book) ? 'bg-primary/10' : 'active:bg-muted/60 hover:bg-muted/40 transition-colors'"
        data-test="series-chapter-strip-row"
      >
        <span
          class="w-14 shrink-0 text-[15px] font-semibold tabular-nums"
          :class="isCurrent(book) ? 'text-primary' : stateOf(book) === 'read' ? 'text-muted-foreground' : 'text-foreground'"
        >
          {{ book.seriesIndex != null ? `#${book.seriesIndex}` : '' }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[13px] leading-snug" :class="isCurrent(book) ? 'font-medium text-foreground' : 'text-muted-foreground'">
            {{ titleOf(book) }}
          </span>
          <span v-if="isCurrent(book)" class="block text-xs font-semibold text-primary">{{ t('book.detail.discover.thisChapter') }}</span>
        </span>
        <component :is="STATE_ICONS[stateOf(book)]" :size="18" class="shrink-0" :class="STATE_CLASSES[stateOf(book)]" aria-hidden="true" />
        <span class="sr-only">{{ stateLabel(book) }}</span>
      </component>
    </li>
  </ol>
</template>
