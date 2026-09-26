<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookCheck, Check, ChevronRight, X } from '@lucide/vue'
import type { SeriesNextBook } from '@bookorbit/types'

const { t, locale } = useI18n()

const props = defineProps<{
  /** The next book in the series; the card offers only "Mark as read" without one. */
  nextBook: SeriesNextBook | null
  /** When this book was added, if it is the newest the reader has not read past: the series is caught up. */
  caughtUpSince?: string | null
  markedRead: boolean
  markingRead?: boolean
  openingNext?: boolean
}>()

const emit = defineEmits<{
  openNext: []
  markRead: []
  dismiss: []
}>()

const nextLabel = computed(() => {
  const next = props.nextBook
  if (!next) return ''
  const title = next.title ?? t('reader.endCard.untitled')
  return next.seriesIndex ? t('reader.endCard.numbered', { index: next.seriesIndex, title }) : title
})

const caughtUpDate = computed(() => {
  if (props.nextBook || !props.caughtUpSince) return null
  const date = new Date(props.caughtUpSince)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
})

const eyebrow = computed(() => {
  if (props.nextBook) return t('reader.endCard.eyebrow')
  return props.caughtUpSince ? t('reader.endCard.caughtUp') : t('reader.endCard.endOfBook')
})

function handleOpenNext() {
  emit('openNext')
}

function handleMarkRead() {
  emit('markRead')
}

function handleDismiss() {
  emit('dismiss')
}
</script>

<template>
  <div
    class="w-full max-w-md rounded-xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur-md"
    role="region"
    :aria-label="t('reader.endCard.region')"
    data-testid="reader-end-card"
  >
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1 py-1">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{{ eyebrow }}</p>
        <p v-if="nextBook" class="truncate text-sm font-medium text-foreground">{{ nextLabel }}</p>
        <p v-else-if="caughtUpDate" class="truncate text-sm text-foreground">{{ t('reader.endCard.caughtUpSince', { date: caughtUpDate }) }}</p>
      </div>
      <button
        type="button"
        class="-mr-1 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
        :aria-label="t('reader.endCard.dismiss')"
        @click="handleDismiss"
      >
        <X :size="18" aria-hidden="true" />
      </button>
    </div>
    <div class="mt-2 flex gap-2">
      <button
        type="button"
        class="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
        :disabled="markedRead || markingRead"
        data-testid="reader-end-card-mark-read"
        @click="handleMarkRead"
      >
        <Check v-if="markedRead" :size="16" aria-hidden="true" />
        <BookCheck v-else :size="16" aria-hidden="true" />
        <span class="truncate">{{ markedRead ? t('reader.endCard.markedAsRead') : t('reader.endCard.markAsRead') }}</span>
      </button>
      <button
        v-if="nextBook"
        type="button"
        class="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        :disabled="openingNext"
        :aria-label="t('reader.endCard.openNext', { title: nextLabel })"
        data-testid="reader-end-card-next"
        @click="handleOpenNext"
      >
        <span class="truncate">{{ t('reader.endCard.next') }}</span>
        <ChevronRight :size="16" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
