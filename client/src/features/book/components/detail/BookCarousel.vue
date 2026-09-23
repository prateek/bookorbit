<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

import { useCoverVersions } from '@/features/book/composables/useCoverVersions'
import { STATUS_COLORS, STATUS_ICONS } from '@/features/book/composables/useBookStatus'
import { decodeHtmlEntities } from '@/features/book/lib/display-text'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import BookCoverSurface from '@/features/book/components/BookCoverSurface.vue'
import type { CoverAspectRatio, ReadStatus, UserBookStatus } from '@bookorbit/types'

export interface CarouselBook {
  /** The book whose cover the card shows; a series card uses its cover book. */
  id: number
  title: string | null
  coverAspectRatio: CoverAspectRatio
  updatedAt?: string | null
  seriesIndex?: string | null
  hasCover: boolean
  authors: string[]
  readStatus?: UserBookStatus | null
  isAudiobook?: boolean
  isComic?: boolean
  /** Unique card key when `id` alone is not, such as a series card keyed by its series. */
  key?: string
  /** Where a tap goes; the book's detail page when omitted. */
  to?: RouteLocationRaw
  /** Line under the title when the shelf is captioned, such as a chapter count. */
  caption?: string | null
}

const props = withDefaults(
  defineProps<{
    books: CarouselBook[]
    loading: boolean
    currentBookId?: number | null
    showSeriesIndex?: boolean
    showHeader?: boolean
    /** 'lg' is the book detail shelf, where the cover is the whole point. */
    size?: 'md' | 'lg'
    /** Prints the title and caption under each cover, for shelves where covers look alike. */
    captioned?: boolean
  }>(),
  {
    currentBookId: null,
    showSeriesIndex: false,
    showHeader: true,
    size: 'md',
    captioned: false,
  },
)

/** Only the first few cards stagger in; later ones would stay blank long after the shelf is on screen. */
const MAX_STAGGERED_CARDS = 6

/** Both ratios resolve to the same cover height, so a mixed shelf stays level. */
const cardWidthClass = computed(() => {
  const square = props.size === 'lg' ? 'w-46' : 'w-38'
  const portrait = props.size === 'lg' ? 'w-31' : 'w-30'
  return { square, portrait }
})

const router = useRouter()
const { t } = useI18n()
const { coverUrl } = useCoverVersions()
const scrollEl = ref<HTMLElement | null>(null)
const coverResetVersion = ref(0)

function scroll(direction: 'left' | 'right') {
  if (!scrollEl.value) return
  scrollEl.value.scrollBy({ left: direction === 'left' ? -240 : 240, behavior: 'smooth' })
}

function handleScrollLeft() {
  scroll('left')
}

function handleScrollRight() {
  scroll('right')
}

// scrollIntoView would also scroll the page to the shelf, which sits below the fold on phones.
function centerCard(container: HTMLElement, card: HTMLElement) {
  const containerRect = container.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()
  container.scrollLeft += cardRect.left - containerRect.left - (containerRect.width - cardRect.width) / 2
}

function cardKey(book: CarouselBook): string {
  return book.key ?? String(book.id)
}

function isCurrent(book: CarouselBook): boolean {
  return props.currentBookId != null && book.key == null && book.id === props.currentBookId
}

function navigateToBook(book: CarouselBook) {
  void router.push(book.to ?? { name: 'book-detail', params: { bookId: book.id } })
}

function formatSeriesIndex(index: string | null | undefined): string {
  if (index == null) return ''
  return `#${index}`
}

function displayTitle(book: CarouselBook): string {
  return decodeHtmlEntities(book.title) ?? t('book.detail.details.untitled')
}

function kicker(book: CarouselBook): string | null {
  return props.showSeriesIndex && book.seriesIndex != null ? formatSeriesIndex(book.seriesIndex) : null
}

function isAudiobook(book: CarouselBook): boolean {
  return book.isAudiobook ?? false
}

function isComic(book: CarouselBook): boolean {
  return book.isComic ?? false
}

function readStatus(book: CarouselBook): ReadStatus | null {
  const status = book.readStatus?.status
  return status != null && status !== 'unread' ? status : null
}

function readStatusLabel(status: ReadStatus): string {
  const key = status.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
  return t(`book.readStatus.${key}`)
}

function cardAspectRatio(book: CarouselBook): string {
  return book.coverAspectRatio
}

function staggerDelay(index: number): string {
  return `${Math.min(index, MAX_STAGGERED_CARDS) * 40}ms`
}

watch(
  () => props.books,
  () => {
    coverResetVersion.value += 1
  },
  { immediate: true },
)

// The scroller can mount after the books arrive (a parent transition, a late v-if), so the
// element itself is a source and the centering runs after the DOM has been patched.
watch(
  () => [props.books, props.loading, props.currentBookId, scrollEl.value] as const,
  ([books, loading, currentId, el]) => {
    if (loading || !currentId || books.length === 0 || !el) return
    const card = el.querySelector<HTMLElement>(`[data-book-id="${currentId}"][aria-current="true"]`)
    if (card) centerCard(el, card)
  },
  { immediate: true, flush: 'post' },
)
defineExpose({ scroll })
</script>

<template>
  <div v-if="loading || books.length > 0">
    <div v-if="showHeader" class="flex items-center justify-between mb-4">
      <slot name="header" />
      <div class="flex items-center gap-1 pointer-coarse:hidden">
        <button
          type="button"
          class="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          :aria-label="t('book.detail.discover.scrollBack')"
          @click="handleScrollLeft"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          type="button"
          class="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          :aria-label="t('book.detail.discover.scrollForward')"
          @click="handleScrollRight"
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex gap-6 overflow-x-auto pb-2">
      <div v-for="i in 10" :key="i" class="shrink-0" :class="cardWidthClass.portrait">
        <div class="w-full rounded-sm bg-muted animate-shimmer" style="aspect-ratio: 2/3" />
      </div>
    </div>

    <div v-else ref="scrollEl" data-test="carousel-scroller" class="flex gap-6 overflow-x-auto pb-2">
      <button
        v-for="(book, index) in books"
        :key="cardKey(book)"
        type="button"
        :data-book-id="book.id"
        class="shrink-0 text-left group animate-fade-up"
        :class="book.coverAspectRatio === '1/1' ? cardWidthClass.square : cardWidthClass.portrait"
        :style="{ animationDelay: staggerDelay(index) }"
        :aria-current="isCurrent(book) ? 'true' : undefined"
        @click="navigateToBook(book)"
      >
        <BookCoverSurface
          class="book-cover-surface--spine-fitted relative w-full rounded-sm overflow-hidden transition-transform duration-150 group-hover:scale-[1.02]"
          :interactive="true"
          :disable-spine="isAudiobook(book)"
          :is-comic="isComic(book)"
          :display-mode="isAudiobook(book) ? 'fill-crop' : undefined"
          :style="{ aspectRatio: cardAspectRatio(book) }"
        >
          <BookCoverArtwork
            :src="coverUrl(book.id, 'thumbnail', book.updatedAt)"
            :has-cover="book.hasCover"
            :title="book.title"
            :author-line="book.authors.length > 0 ? book.authors.join(', ') : null"
            :is-audio="isAudiobook(book)"
            :seed="book.title ?? String(book.id)"
            :alt="book.title ?? ''"
            :frame-aspect-ratio="cardAspectRatio(book)"
            :mode="isAudiobook(book) ? 'fill-crop' : undefined"
            :reset-key="`${coverResetVersion}:${book.id}`"
            :spine="!isAudiobook(book)"
            :is-comic="isComic(book)"
          />
          <span
            v-if="readStatus(book)"
            data-test="read-status-badge"
            class="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 rounded-full bg-black/70 py-0.5 pr-2 pl-1 text-[11px] font-medium leading-4 text-white pointer-events-none"
          >
            <component :is="STATUS_ICONS[readStatus(book)!]" :size="12" :class="STATUS_COLORS[readStatus(book)!]" aria-hidden="true" />
            {{ readStatusLabel(readStatus(book)!) }}
          </span>
          <span
            v-if="!captioned && showSeriesIndex && book.seriesIndex != null"
            class="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[11px] font-semibold leading-none px-1.5 py-1 rounded-full pointer-events-none"
          >
            {{ formatSeriesIndex(book.seriesIndex) }}
          </span>
        </BookCoverSurface>
        <span v-if="isCurrent(book)" data-test="current-book-marker" class="mt-1.5 block h-1 w-full rounded-full bg-primary" aria-hidden="true" />
        <span v-if="captioned" class="mt-2 block min-w-0">
          <span
            v-if="kicker(book)"
            data-test="card-kicker"
            class="block truncate text-[13px] font-semibold tabular-nums"
            :class="isCurrent(book) ? 'text-primary' : 'text-foreground'"
            >{{ kicker(book) }}</span
          >
          <span
            data-test="card-title"
            class="line-clamp-2 text-[13px] leading-snug"
            :class="kicker(book) ? 'text-muted-foreground' : 'font-medium text-foreground'"
            >{{ displayTitle(book) }}</span
          >
          <span v-if="book.caption" data-test="card-caption" class="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">{{
            book.caption
          }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
