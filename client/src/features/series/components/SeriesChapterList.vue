<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CheckCircle2, Circle, CircleDot, MoreVertical } from '@lucide/vue'
import type { BookCard } from '@bookorbit/types'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { chapterProgressPercent, chapterReadState, type ChapterReadState } from '../lib/series-chapter'

defineProps<{
  books: BookCard[]
  nextBookId: number | null
  canMarkRead: boolean
}>()

const emit = defineEmits<{
  open: [book: BookCard]
  details: [book: BookCard]
  markReadUpTo: [book: BookCard]
}>()

const { t } = useI18n()

const STATE_ICONS: Record<ChapterReadState, typeof Circle> = { read: CheckCircle2, reading: CircleDot, unread: Circle }
const STATE_CLASSES: Record<ChapterReadState, string> = {
  read: 'text-success',
  reading: 'text-warning',
  unread: 'text-muted-foreground',
}

function stateOf(book: BookCard): ChapterReadState {
  return chapterReadState(book)
}

function stateLabel(book: BookCard): string {
  return t(`series.detail.chapterState.${stateOf(book)}`)
}

function progressOf(book: BookCard): number | null {
  return chapterProgressPercent(book)
}

function handleOpen(book: BookCard) {
  emit('open', book)
}

function handleDetails(book: BookCard) {
  emit('details', book)
}

function handleMarkReadUpTo(book: BookCard) {
  emit('markReadUpTo', book)
}
</script>

<template>
  <ol class="-mx-3 divide-y divide-border/60" data-testid="series-chapter-list">
    <li
      v-for="book in books"
      :key="book.id"
      class="flex items-stretch"
      :class="book.id === nextBookId ? 'bg-primary/8' : ''"
      :data-book-id="book.id"
      data-testid="series-chapter-row"
    >
      <button type="button" class="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left active:bg-muted/60" @click="handleOpen(book)">
        <span class="w-11 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
          {{ book.seriesIndex != null ? `#${book.seriesIndex}` : '' }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[15px] leading-snug" :class="stateOf(book) === 'read' ? 'text-muted-foreground' : 'text-foreground'">
            {{ book.title ?? t('series.detail.untitled') }}
          </span>
          <span v-if="book.id === nextBookId || progressOf(book) !== null" class="mt-0.5 flex items-center gap-2 text-xs">
            <span v-if="book.id === nextBookId" class="font-semibold text-primary">{{ t('series.detail.upNext') }}</span>
            <span v-if="progressOf(book) !== null" class="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span class="h-1 w-14 overflow-hidden rounded-full bg-muted">
                <span class="block h-full rounded-full bg-primary/70" :style="{ width: `${progressOf(book)}%` }" />
              </span>
              {{ t('series.index.percent', { value: progressOf(book) }) }}
            </span>
          </span>
        </span>
        <component
          :is="STATE_ICONS[stateOf(book)]"
          :size="18"
          class="shrink-0"
          :class="STATE_CLASSES[stateOf(book)]"
          :aria-label="stateLabel(book)"
        />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="grid size-11 shrink-0 place-items-center self-center text-muted-foreground transition-colors hover:text-foreground"
            :aria-label="t('series.detail.chapterActions', { title: book.title ?? t('series.detail.untitled') })"
            data-testid="series-chapter-menu"
          >
            <MoreVertical :size="18" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @select="handleDetails(book)">{{ t('series.detail.chapterDetails') }}</DropdownMenuItem>
          <DropdownMenuItem v-if="canMarkRead && book.seriesIndex != null" data-testid="series-mark-read-up-to" @select="handleMarkReadUpTo(book)">
            {{ t('series.detail.markReadUpToHere') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  </ol>
</template>
