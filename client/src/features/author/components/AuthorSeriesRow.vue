<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckCircle2 } from '@lucide/vue'
import type { BookCard } from '@bookorbit/types'
import { useCoverVersions } from '@/features/book/composables/useCoverVersions'
import { decodeHtmlEntities } from '@/features/book/lib/display-text'

const props = defineProps<{
  /** A collapsed series card: `collapsedSeries` is set. */
  book: BookCard
  /** Serial chapters are numbered as chapters rather than as volumes. */
  serial?: boolean
  continuing?: boolean
}>()

const emit = defineEmits<{
  open: [book: BookCard]
  continue: [book: BookCard]
}>()

const { t } = useI18n()
const { coverUrl } = useCoverVersions()

const collapsed = computed(() => props.book.collapsedSeries!)
const name = computed(() => decodeHtmlEntities(props.book.seriesName ?? props.book.title ?? ''))
const unreadCount = computed(() => Math.max(0, collapsed.value.bookCount - collapsed.value.readCount))
const caughtUp = computed(() => unreadCount.value === 0)
const started = computed(() => collapsed.value.readCount > 0)

const latestLabel = computed(() => {
  const index = collapsed.value.latestSeriesIndex
  if (!index) return null
  return props.serial ? t('author.detail.books.latestChapter', { index }) : t('author.detail.books.latestNumber', { index })
})

const statusLine = computed(() => {
  if (caughtUp.value) return latestLabel.value
  return [t('author.detail.books.unreadCount', { count: unreadCount.value }), latestLabel.value].filter(Boolean).join(' · ')
})

const coverBookId = computed(() => collapsed.value.latestVolumeBookId ?? props.book.id)
const coverFailed = ref(false)
const coverSrc = computed(() => {
  const id = coverBookId.value
  const version = id === props.book.id ? (props.book.updatedAt ?? props.book.addedAt) : collapsed.value.coverUpdatedAtByBookId?.[id]
  return coverUrl(id, 'thumbnail', version)
})
const initial = computed(() => name.value.trim().charAt(0).toUpperCase() || '?')

const actionLabel = computed(() =>
  started.value ? t('author.detail.books.continueAria', { name: name.value }) : t('author.detail.books.startAria', { name: name.value }),
)

function handleOpen() {
  emit('open', props.book)
}

function handleContinue() {
  emit('continue', props.book)
}

function handleCoverError() {
  coverFailed.value = true
}
</script>

<template>
  <div class="relative flex min-h-[4.5rem] items-center gap-3 py-2" data-testid="author-series-row">
    <!-- Stretched so the whole row opens the series without nesting the Continue button inside another button. -->
    <button
      type="button"
      class="absolute inset-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      :aria-label="name"
      @click="handleOpen"
    />

    <span class="pointer-events-none relative h-16 w-11 shrink-0 overflow-hidden rounded-sm bg-muted">
      <img v-if="!coverFailed" :src="coverSrc" alt="" loading="lazy" class="h-full w-full object-cover" @error="handleCoverError" />
      <span v-else class="flex h-full w-full items-center justify-center text-base font-semibold text-muted-foreground">{{ initial }}</span>
    </span>

    <span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="line-clamp-2 text-[17px] font-semibold leading-snug text-foreground">{{ name }}</span>
      <span class="flex min-w-0 items-center gap-1.5 text-[15px] text-muted-foreground tabular-nums">
        <template v-if="caughtUp">
          <CheckCircle2 :size="15" class="shrink-0 text-primary" aria-hidden="true" />
          <span class="shrink-0 font-medium text-foreground">{{ t('author.detail.books.caughtUp') }}</span>
          <span v-if="statusLine" class="truncate">· {{ statusLine }}</span>
        </template>
        <span v-else class="truncate" data-testid="author-series-row-status">{{ statusLine }}</span>
      </span>
    </span>

    <button
      v-if="!caughtUp"
      type="button"
      data-testid="author-series-row-continue"
      class="relative h-11 shrink-0 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      :aria-label="actionLabel"
      :disabled="continuing"
      @click="handleContinue"
    >
      {{ started ? t('author.detail.books.continue') : t('author.detail.books.start') }}
    </button>
  </div>
</template>
