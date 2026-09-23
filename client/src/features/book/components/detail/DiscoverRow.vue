<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import type { RelatedShelfItem, SeriesBookRecommendation } from '@bookorbit/types'
import { api } from '@/lib/api'
import BookCarousel from '@/features/book/components/detail/BookCarousel.vue'
import SeriesChapterStrip from '@/features/book/components/detail/SeriesChapterStrip.vue'
import ShelfScrollButtons from '@/features/book/components/detail/ShelfScrollButtons.vue'
import { relatedShelfCard, withoutItemsIn } from '@/features/book/components/detail/related-shelf'

type Section = 'series' | 'author' | 'similar'

const props = withDefaults(
  defineProps<{
    bookId: number
    seriesId?: number | null
    seriesName: string | null
    authorCount: number
    /** The author's name when the book has exactly one, for the "More by" heading. */
    authorName?: string | null
    /** Cover size for the shelf; 'lg' is the book detail layout. */
    size?: 'md' | 'lg'
    /** Drops the top rule and margin when the row sits in its own grid cell. */
    flush?: boolean
  }>(),
  { seriesId: null, authorName: null, size: 'md', flush: false },
)

const emit = defineEmits<{
  /** The series window around this book, current book included, in reading order. */
  'series-books': [books: SeriesBookRecommendation[]]
}>()

const { t } = useI18n()

const seriesBooks = ref<SeriesBookRecommendation[]>([])
const authorItems = ref<RelatedShelfItem[]>([])
const similarItems = ref<RelatedShelfItem[]>([])
const loading = ref<Record<Section, boolean>>({ series: false, author: false, similar: false })

const seriesCarouselRef = ref<InstanceType<typeof BookCarousel> | null>(null)
const authorCarouselRef = ref<InstanceType<typeof BookCarousel> | null>(null)
const similarCarouselRef = ref<InstanceType<typeof BookCarousel> | null>(null)

let requestToken = 0

const hasOtherSeriesBooks = computed(() => seriesBooks.value.some((b) => b.id !== props.bookId))
const filteredSimilar = computed(() => withoutItemsIn(similarItems.value, authorItems.value))

const authorCards = computed(() => authorItems.value.map((item) => relatedShelfCard(item, t)))
const similarCards = computed(() => filteredSimilar.value.map((item) => relatedShelfCard(item, t)))

const showSeries = computed(() => loading.value.series || hasOtherSeriesBooks.value)
const showAuthor = computed(() => loading.value.author || authorItems.value.length > 0)
const showSimilar = computed(() => loading.value.similar || filteredSimilar.value.length > 0)
const hasAnyContent = computed(() => showSeries.value || showAuthor.value || showSimilar.value)

const authorHeading = computed(() =>
  props.authorName ? t('book.detail.discover.moreByAuthor', { name: props.authorName }) : t('book.detail.discover.moreByAuthors'),
)

const ENDPOINTS: Record<Section, (bookId: number) => string> = {
  series: (bookId) => `/api/v1/books/${bookId}/series-books`,
  author: (bookId) => `/api/v1/books/${bookId}/author-books?group=series`,
  similar: (bookId) => `/api/v1/books/${bookId}/recommendations?group=series`,
}

async function fetchSection(section: Section, token: number) {
  loading.value = { ...loading.value, [section]: true }
  try {
    const res = await api(ENDPOINTS[section](props.bookId))
    if (!res.ok || token !== requestToken) return
    const data = await res.json()
    if (token !== requestToken) return
    if (section === 'series') seriesBooks.value = data
    else if (section === 'author') authorItems.value = data
    else similarItems.value = data
  } catch {
    // Related shelves are optional; a failed lookup leaves its section out.
  } finally {
    if (token === requestToken) loading.value = { ...loading.value, [section]: false }
  }
}

async function loadShelves() {
  const token = ++requestToken
  seriesBooks.value = []
  authorItems.value = []
  similarItems.value = []
  loading.value = { series: false, author: false, similar: false }

  const sections: Section[] = []
  if (props.seriesName || props.seriesId != null) sections.push('series')
  if (props.authorCount > 0) sections.push('author')
  sections.push('similar')
  await Promise.all(sections.map((section) => fetchSection(section, token)))
}

function handleSeriesScrollBack() {
  seriesCarouselRef.value?.scroll('left')
}

function handleSeriesScrollForward() {
  seriesCarouselRef.value?.scroll('right')
}

function handleAuthorScrollBack() {
  authorCarouselRef.value?.scroll('left')
}

function handleAuthorScrollForward() {
  authorCarouselRef.value?.scroll('right')
}

function handleSimilarScrollBack() {
  similarCarouselRef.value?.scroll('left')
}

function handleSimilarScrollForward() {
  similarCarouselRef.value?.scroll('right')
}

onMounted(loadShelves)

watch(
  () => props.bookId,
  (newId, oldId) => {
    if (newId !== oldId) void loadShelves()
  },
)

watch(seriesBooks, (books) => emit('series-books', books))
</script>

<template>
  <div v-if="hasAnyContent" class="flex flex-col gap-8" :class="flush ? 'min-h-0' : 'mt-8 pt-6 border-t border-border'">
    <section v-if="showSeries" data-test="discover-series" aria-labelledby="discover-series-heading">
      <div class="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h2 id="discover-series-heading" class="min-w-0 truncate text-[15px] font-semibold">{{ t('book.detail.discover.inThisSeries') }}</h2>
        <div class="flex shrink-0 items-center gap-1">
          <RouterLink
            v-if="seriesId != null"
            data-test="discover-series-all"
            :to="{ name: 'series-detail', params: { seriesId } }"
            class="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary hover:underline underline-offset-2"
          >
            {{ t('book.detail.discover.seeAll') }}
          </RouterLink>
          <ShelfScrollButtons class="@max-[46rem]/book-detail:hidden" @back="handleSeriesScrollBack" @forward="handleSeriesScrollForward" />
        </div>
      </div>
      <div v-if="loading.series" class="space-y-1 @min-[46rem]/book-detail:hidden" aria-hidden="true">
        <div v-for="i in 6" :key="i" class="h-11 rounded-md bg-muted animate-shimmer" />
      </div>
      <SeriesChapterStrip v-else class="@min-[46rem]/book-detail:hidden" :books="seriesBooks" :current-book-id="bookId" />
      <BookCarousel
        ref="seriesCarouselRef"
        class="hidden @min-[46rem]/book-detail:block"
        :size="size"
        :books="seriesBooks"
        :loading="loading.series"
        :current-book-id="bookId"
        :show-series-index="true"
        :show-header="false"
        captioned
      />
    </section>

    <section v-if="showAuthor" data-test="discover-author" aria-labelledby="discover-author-heading">
      <div class="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h2 id="discover-author-heading" class="min-w-0 truncate text-[15px] font-semibold">{{ authorHeading }}</h2>
        <ShelfScrollButtons @back="handleAuthorScrollBack" @forward="handleAuthorScrollForward" />
      </div>
      <BookCarousel ref="authorCarouselRef" :size="size" :books="authorCards" :loading="loading.author" :show-header="false" captioned />
    </section>

    <section v-if="showSimilar" data-test="discover-similar" aria-labelledby="discover-similar-heading">
      <div class="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h2 id="discover-similar-heading" class="min-w-0 truncate text-[15px] font-semibold">{{ t('book.detail.discover.similar') }}</h2>
        <ShelfScrollButtons @back="handleSimilarScrollBack" @forward="handleSimilarScrollForward" />
      </div>
      <BookCarousel ref="similarCarouselRef" :size="size" :books="similarCards" :loading="loading.similar" :show-header="false" captioned />
    </section>
  </div>
</template>
