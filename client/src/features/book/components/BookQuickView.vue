<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { BookOpen, ExternalLink, Eye, Folder, FolderPlus, Headphones, MoreHorizontal, Pencil, Star, Trash2, X } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import { api } from '@/lib/api'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { DialogRoot, DialogContent, DialogPortal, DialogOverlay, DialogClose, DialogTitle, DialogDescription } from 'reka-ui'
import { formatBytes } from '@/lib/formatting'
import { getProviderColor } from '@/lib/provider-colors'
import { createBookProviderLinks } from '@/features/book/lib/provider-links'
import { useBookDetail } from '../composables/useBookDetail'
import { useCoverVersions } from '../composables/useCoverVersions'
import { getFormatColor } from '../lib/format-colors'
import { displayPublishedDate } from '../lib/published-date'
import { FORMAT_TO_GROUP, type BookFileRef } from '@bookorbit/types'
import { COVER_ASPECT_RATIO_KEY, DEFAULT_COVER_ASPECT_RATIO } from '../lib/cover-aspect-ratio'
import { useDisplaySettings } from '@/composables/useDisplaySettings'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSafeHtml } from '@/features/book/composables/useSafeHtml'
import BookCoverArtwork from './BookCoverArtwork.vue'
import BookCoverSurface from './BookCoverSurface.vue'
import { useI18n } from 'vue-i18n'
import { hasReadAlong, isReadAlongFormat, READ_ALONG_FORMAT_COLOR, READ_ALONG_FORMAT_TITLE } from '@/features/book/lib/file-capabilities'
import { decodeHtmlEntities } from '../lib/display-text'
import { seriesCoverSeed } from '../lib/cover-seed'

const { t } = useI18n()

const props = defineProps<{ bookId: number | null; open: boolean }>()
const { hasPermission } = usePermissions()
const emit = defineEmits<{
  'update:open': [value: boolean]
  action: [type: 'add-to-collection' | 'delete']
}>()

const router = useRouter()
const { detail, loading, fetch } = useBookDetail()

const coverLoaded = ref(false)
const coverFailed = ref(false)
const coverImageRatio = ref<number | null>(null)
const providerIconErrors = ref<Record<string, boolean>>({})
const descriptionExpanded = ref(false)
const genresExpanded = ref(false)
const coverLightboxOpen = ref(false)
const moreActionsOpen = ref(false)
const progressPercent = ref(0)
let progressRequest = 0

// Phones get a bottom sheet, which dismisses with a swipe; wider screens keep the side drawer.
const isCompact = useMediaQuery('(max-width: 767px)')

async function loadProgress(bookId: number) {
  const request = ++progressRequest
  progressPercent.value = 0
  try {
    const res = await api(`/api/v1/books/${bookId}/progress`)
    if (!res.ok || request !== progressRequest) return
    const rows = (await res.json()) as Array<{ percentage?: number | null }>
    if (request !== progressRequest) return
    const percentages = rows.map((row) => (typeof row.percentage === 'number' && Number.isFinite(row.percentage) ? row.percentage : 0))
    progressPercent.value = Math.min(100, Math.max(0, ...percentages))
  } catch {
    // Progress is a hint in the quick view; without it the sheet still shows the read status.
  }
}

watch(
  () => props.bookId,
  (id) => {
    if (id !== null) {
      coverLoaded.value = false
      coverFailed.value = false
      coverImageRatio.value = null
      descriptionExpanded.value = false
      genresExpanded.value = false
      moreActionsOpen.value = false
      providerIconErrors.value = {}
      fetch(id)
      void loadProgress(id)
    }
  },
  { immediate: true },
)

const { coverUrl } = useCoverVersions()
const coverSrc = computed(() => (detail.value ? coverUrl(detail.value.id, 'cover', detail.value.updatedAt ?? detail.value.addedAt) : null))

const displayTitle = computed(() => decodeHtmlEntities(detail.value?.title) ?? null)
const coverSeed = computed(() => {
  if (!detail.value) return ''
  if (detail.value.seriesName?.trim()) return seriesCoverSeed(detail.value.seriesName)
  return detail.value.title ?? detail.value.folderPath.split('/').pop() ?? String(detail.value.id)
})
const coverPlaceholderTitle = computed(() => (detail.value ? (displayTitle.value ?? detail.value.folderPath.split('/').pop() ?? null) : null))

const seriesLine = computed(() => {
  if (!detail.value?.seriesName) return null
  const idx = detail.value.seriesIndex
  return idx != null ? `${detail.value.seriesName} #${idx}` : detail.value.seriesName
})

const readStatus = computed(() => detail.value?.readStatus?.status ?? 'unread')
const inProgress = computed(() => readStatus.value !== 'read' && progressPercent.value > 0 && progressPercent.value < 100)
const roundedProgress = computed(() => `${Math.max(1, Math.min(99, Math.round(progressPercent.value)))}%`)

/** "#1003 · 93% read": where this book sits and how far the reader has got. */
const readingLine = computed(() => {
  if (!detail.value) return null
  const parts: string[] = []
  if (detail.value.seriesIndex != null) parts.push(`#${detail.value.seriesIndex}`)
  if (inProgress.value) parts.push(t('book.quickView.percentRead', { percent: roundedProgress.value }))
  else {
    const key = readStatus.value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
    parts.push(t(`book.readStatus.${key}`))
  }
  return parts.join(' · ')
})

const primaryActionLabel = computed(() => {
  if (readStatus.value === 'read') return t(isPrimaryAudio.value ? 'book.detail.details.listenAgain' : 'book.detail.details.readAgain')
  if (inProgress.value) return t('book.detail.details.resumeAt', { percent: roundedProgress.value })
  return isPrimaryAudio.value ? t('book.actions.listen') : t('book.actions.read')
})

const authorLine = computed(() => detail.value?.authors.map((a) => a.name).join(', ') ?? null)
const ratingStars = [1, 2, 3, 4, 5]
const providerLinks = computed(() => (detail.value ? createBookProviderLinks(detail.value.providerIds) : []))

const safeDescription = useSafeHtml(() => detail.value?.description)

const coverAspectRatio = inject(COVER_ASPECT_RATIO_KEY, ref(DEFAULT_COVER_ASPECT_RATIO))
const { bookCoverDisplayMode } = useDisplaySettings()
const quickViewCoverAspectRatio = computed(() => {
  if (
    bookCoverDisplayMode.value !== 'natural-bottom' ||
    detail.value?.coverSource == null ||
    !coverLoaded.value ||
    coverFailed.value ||
    !coverImageRatio.value
  ) {
    return coverAspectRatio.value
  }

  return `${coverImageRatio.value} / 1`
})

const primaryFile = computed(() => detail.value?.files.find((f) => f.role === 'primary') ?? detail.value?.files[0] ?? null)
const readAlongFile = computed(() => detail.value?.files.find((file) => hasReadAlong(file)) ?? null)
const isPrimaryAudio = computed(() => primaryFile.value?.format != null && FORMAT_TO_GROUP[primaryFile.value.format] === 'audio')
const isPrimaryComic = computed(() => primaryFile.value?.format != null && FORMAT_TO_GROUP[primaryFile.value.format] === 'cbx')
const knownFormats = computed(() => [
  ...new Set((detail.value?.files ?? []).filter((f) => f.format && FORMAT_TO_GROUP[f.format]).map((f) => f.format!)),
])
const publishedDisplay = computed(() => (detail.value ? displayPublishedDate(detail.value.publishedDate, detail.value.publishedYear) : null))

function providerLinkStyle(provider: string) {
  const color = getProviderColor(provider)
  return {
    borderColor: `${color}66`,
    backgroundColor: `${color}12`,
  }
}

function formatBadgeStyle(fmt: string) {
  const color = formatHasReadAlong(fmt) ? READ_ALONG_FORMAT_COLOR : getFormatColor(fmt)
  return {
    color,
    borderColor: `${color}66`,
    backgroundColor: `${color}1a`,
  }
}

function fileFormatBadgeStyle(file: Pick<BookFileRef, 'format' | 'mediaOverlay'>) {
  const color = hasReadAlong(file) ? READ_ALONG_FORMAT_COLOR : getFormatColor(file.format ?? '?')
  return {
    color,
    borderColor: `${color}66`,
    backgroundColor: `${color}1a`,
  }
}

function formatHasReadAlong(fmt: string): boolean {
  return isReadAlongFormat(fmt, readAlongFile.value != null)
}

function handleCoverLoad(ratio: number | null) {
  coverLoaded.value = true
  coverFailed.value = false
  coverImageRatio.value = ratio
}

function handleCoverError() {
  coverLoaded.value = false
  coverFailed.value = true
  coverImageRatio.value = null
}

function handleCoverClick() {
  if (coverLoaded.value && !coverFailed.value) coverLightboxOpen.value = true
}

function openBookWithMode(mode?: 'peek') {
  if (!primaryFile.value || !detail.value) return
  router.push({
    name: 'reader',
    params: { bookId: detail.value.id, fileId: primaryFile.value.id },
    query: mode === 'peek' ? { format: primaryFile.value.format ?? 'epub', mode } : { format: primaryFile.value.format ?? 'epub' },
  })
  emit('update:open', false)
}

function openBook() {
  openBookWithMode()
}

function peekBook() {
  openBookWithMode('peek')
}

function editMetadata() {
  if (!detail.value) return
  router.push({ name: 'book-detail', params: { bookId: detail.value.id }, query: { tab: 'edit' } })
  emit('update:open', false)
}

function openDetails() {
  if (!detail.value) return
  router.push({ name: 'book-detail', params: { bookId: detail.value.id } })
  emit('update:open', false)
}

function toggleGenres() {
  genresExpanded.value = !genresExpanded.value
}

function handleAddToCollection() {
  emit('update:open', false)
  emit('action', 'add-to-collection')
}

function handleDelete() {
  emit('update:open', false)
  emit('action', 'delete')
}

function toggleMoreActions() {
  moreActionsOpen.value = !moreActionsOpen.value
}

function toggleDescription() {
  descriptionExpanded.value = !descriptionExpanded.value
}

function handleOpenChange(value: boolean) {
  emit('update:open', value)
}
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <Sheet :open="props.open" @update:open="handleOpenChange">
      <SheetContent
        :side="isCompact ? 'bottom' : 'right'"
        class="p-0 overflow-hidden"
        :class="isCompact ? 'max-h-[85dvh] rounded-t-2xl' : 'sm:max-w-100'"
        data-testid="quick-view-sheet"
      >
        <SheetTitle class="sr-only">{{
          displayTitle ? t('book.quickView.titleFor', { title: displayTitle }) : t('book.quickView.title')
        }}</SheetTitle>
        <SheetDescription class="sr-only">{{ t('book.quickView.description') }}</SheetDescription>
        <div class="flex min-h-0 flex-1 flex-col">
          <div v-if="isCompact" class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          <!-- Header: cover + title block -->
          <div class="p-5 border-b shrink-0" :class="isCompact ? 'pt-4' : 'pt-10'">
            <div v-if="loading" class="flex gap-4 items-start">
              <Skeleton class="w-24 rounded shrink-0" :style="{ aspectRatio: coverAspectRatio }" />
              <div class="flex-1 space-y-2 pt-1">
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-3 w-3/4" />
                <Skeleton class="h-3 w-1/2" />
              </div>
            </div>

            <div v-else-if="detail" class="flex gap-4 items-start">
              <!-- Cover -->
              <BookCoverSurface
                size="mini"
                class="book-cover-surface--spine-fitted w-24 shrink-0 rounded overflow-hidden relative"
                :disable-spine="isPrimaryAudio"
                :is-comic="isPrimaryComic"
                :class="detail.coverSource && !coverFailed ? 'cursor-zoom-in' : ''"
                :style="{ aspectRatio: quickViewCoverAspectRatio }"
                @click="handleCoverClick"
              >
                <BookCoverArtwork
                  :src="coverSrc"
                  :has-cover="detail.coverSource !== null"
                  :title="coverPlaceholderTitle"
                  :author-line="authorLine"
                  :is-audio="isPrimaryAudio"
                  :seed="coverSeed"
                  :alt="detail.title ?? ''"
                  :frame-aspect-ratio="quickViewCoverAspectRatio"
                  loading="eager"
                  :spine="!isPrimaryAudio"
                  :is-comic="isPrimaryComic"
                  @load="handleCoverLoad"
                  @error="handleCoverError"
                />
              </BookCoverSurface>

              <!-- Info -->
              <div class="flex-1 min-w-0 pr-2">
                <h2 class="text-sm font-bold leading-snug line-clamp-3">
                  {{ displayTitle ?? t('book.untitled') }}
                </h2>
                <p v-if="detail.subtitle" class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {{ detail.subtitle }}
                </p>
                <p v-if="readingLine" data-testid="quick-view-reading-line" class="mt-1 text-[13px] font-medium tabular-nums text-foreground">
                  {{ readingLine }}
                </p>
                <div v-if="providerLinks.length" class="mt-2 flex items-center gap-1">
                  <a
                    v-for="link in providerLinks"
                    :key="link.key"
                    :href="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="t('book.quickView.openIn', { provider: link.label })"
                    class="inline-flex size-6 items-center justify-center rounded border transition-colors hover:bg-muted/60"
                    :style="providerLinkStyle(link.key)"
                  >
                    <img
                      v-if="link.iconUrl && !providerIconErrors[link.key]"
                      :src="link.iconUrl"
                      :alt="link.label"
                      class="size-3.5 rounded-[2px] object-contain"
                      loading="lazy"
                      @error="providerIconErrors[link.key] = true"
                    />
                    <span v-else class="text-[8px] font-bold leading-none text-foreground">{{ link.fallback }}</span>
                  </a>
                </div>
                <p v-if="authorLine" class="text-xs text-foreground mt-2">{{ authorLine }}</p>
                <p v-if="seriesLine" class="text-xs text-muted-foreground mt-0.5 italic">{{ seriesLine }}</p>
                <div v-if="detail.rating != null" class="mt-2 flex items-center gap-1">
                  <Star
                    v-for="star in ratingStars"
                    :key="star"
                    class="size-3"
                    :class="detail.rating >= star ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'"
                  />
                  <span class="text-[10px] text-muted-foreground ml-1">{{ detail.rating }}/5</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Body: scrollable meta + description -->
          <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <template v-if="loading">
              <div class="flex gap-1.5">
                <Skeleton class="h-5 w-12 rounded" />
                <Skeleton class="h-5 w-16 rounded" />
                <Skeleton class="h-5 w-10 rounded" />
              </div>
              <Skeleton class="h-3 w-1/2" />
              <Skeleton class="h-32 w-full rounded" />
            </template>

            <template v-else-if="detail">
              <!-- Format badges + meta chips -->
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="fmt in knownFormats"
                  :key="fmt"
                  class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border"
                  :style="formatBadgeStyle(fmt)"
                  :title="formatHasReadAlong(fmt) ? READ_ALONG_FORMAT_TITLE : undefined"
                >
                  {{ fmt }}
                  <Headphones v-if="formatHasReadAlong(fmt)" class="size-3 shrink-0" :stroke-width="2.5" aria-hidden="true" />
                </span>
                <span v-if="detail.pageCount" class="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {{ t('book.quickView.pages', { count: detail.pageCount }) }}
                </span>
                <span v-if="publishedDisplay" class="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {{ publishedDisplay }}
                </span>
                <span
                  v-if="detail.language"
                  class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {{ detail.language }}
                </span>
              </div>

              <!-- Publisher -->
              <p v-if="detail.publisher" class="text-xs text-muted-foreground">
                {{ detail.publisher }}
              </p>

              <!-- Primary file summary -->
              <div v-if="primaryFile" class="rounded-md border border-border bg-muted/20 px-3 py-2.5">
                <p class="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{{ t('book.quickView.primaryFile') }}</p>
                <p class="text-xs text-foreground mt-1 truncate">
                  {{ primaryFile.filename ?? t('book.quickView.fileNumber', { id: primaryFile.id }) }}
                </p>
                <div class="mt-1.5 flex items-center gap-1.5">
                  <span
                    class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border"
                    :style="fileFormatBadgeStyle(primaryFile)"
                    :title="hasReadAlong(primaryFile) ? READ_ALONG_FORMAT_TITLE : undefined"
                  >
                    {{ (primaryFile.format ?? '?').toUpperCase() }}
                    <Headphones v-if="hasReadAlong(primaryFile)" class="size-3 shrink-0" :stroke-width="2.5" aria-hidden="true" />
                  </span>
                  <span class="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {{ formatBytes(primaryFile.sizeBytes) }}
                  </span>
                </div>
              </div>

              <!-- ISBN -->
              <dl v-if="detail.isbn13 || detail.isbn10" class="grid grid-cols-1 gap-y-2 border-t pt-4">
                <div v-if="detail.isbn13" class="min-w-0">
                  <dt class="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">ISBN-13</dt>
                  <dd class="text-xs text-foreground mt-0.5 font-mono">{{ detail.isbn13 }}</dd>
                </div>
                <div v-if="detail.isbn10" class="min-w-0">
                  <dt class="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">ISBN-10</dt>
                  <dd class="text-xs text-foreground mt-0.5 font-mono">{{ detail.isbn10 }}</dd>
                </div>
              </dl>

              <!-- Genres -->
              <div v-if="detail.genres.length">
                <div class="flex flex-wrap gap-1.5 overflow-hidden transition-all" :style="genresExpanded ? {} : { maxHeight: '78px' }">
                  <span v-for="genre in detail.genres" :key="genre" class="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {{ genre }}
                  </span>
                </div>
                <button
                  v-if="detail.genres.length > 5"
                  class="text-xs text-muted-foreground hover:text-foreground mt-1.5 transition-colors"
                  @click="toggleGenres"
                >
                  {{ genresExpanded ? t('book.quickView.showLess') : t('book.quickView.showMore') }}
                </button>
              </div>

              <!-- Collections -->
              <div v-if="detail.collections.length" class="border-t pt-4">
                <p class="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">{{ t('book.quickView.collections') }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="col in detail.collections"
                    :key="col.id"
                    class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >
                    <Folder class="size-2.5 shrink-0" />
                    {{ col.name }}
                  </span>
                </div>
              </div>

              <!-- Description -->
              <div class="border-t pt-4">
                <div v-if="detail.description">
                  <div
                    class="text-sm leading-relaxed text-foreground transition-all"
                    :class="descriptionExpanded ? '' : 'line-clamp-4'"
                    v-html="safeDescription"
                  />
                  <button
                    type="button"
                    class="touch-target text-xs text-muted-foreground hover:text-foreground mt-1.5 transition-colors"
                    @click="toggleDescription"
                  >
                    {{ descriptionExpanded ? t('book.quickView.showLess') : t('book.quickView.showMore') }}
                  </button>
                </div>
                <p v-else class="text-xs text-muted-foreground italic">{{ t('book.quickView.noDescription') }}</p>
              </div>
            </template>
          </div>

          <!-- Footer: actions -->
          <div class="border-t shrink-0 space-y-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              data-testid="quick-view-action-read"
              class="flex w-full items-center justify-center gap-2 h-12 md:h-10 rounded-md bg-primary text-primary-foreground text-[15px] md:text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              :disabled="!primaryFile"
              @click="openBook"
            >
              <Headphones v-if="isPrimaryAudio" class="size-4" />
              <BookOpen v-else class="size-4" />
              {{ primaryActionLabel }}
            </button>
            <div class="grid auto-cols-fr grid-flow-col gap-2">
              <button
                type="button"
                class="flex h-11 md:h-9 flex-col items-center justify-center gap-0.5 rounded-md border border-input bg-background text-[11px] font-medium hover:bg-muted transition-colors"
                @click="openDetails"
              >
                <ExternalLink class="size-4" />
                {{ t('book.actions.details') }}
              </button>
              <button
                type="button"
                class="flex h-11 md:h-9 flex-col items-center justify-center gap-0.5 rounded-md border border-input bg-background text-[11px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
                :disabled="!primaryFile"
                @click="peekBook"
              >
                <Eye class="size-4" />
                {{ t('book.actions.peek') }}
              </button>
              <button
                type="button"
                data-testid="quick-view-action-add-to-collection"
                class="flex h-11 md:h-9 flex-col items-center justify-center gap-0.5 rounded-md border border-input bg-background text-[11px] font-medium hover:bg-muted transition-colors"
                @click="handleAddToCollection"
              >
                <FolderPlus class="size-4" />
                {{ t('book.quickView.collection') }}
              </button>
              <button
                v-if="hasPermission('library_edit_metadata') || hasPermission('library_delete_books')"
                type="button"
                data-testid="quick-view-action-more"
                class="flex h-11 md:h-9 flex-col items-center justify-center gap-0.5 rounded-md border border-input bg-background text-[11px] font-medium hover:bg-muted transition-colors"
                :aria-expanded="moreActionsOpen"
                aria-controls="quick-view-more-actions"
                @click="toggleMoreActions"
              >
                <MoreHorizontal class="size-4" />
                {{ t('book.quickView.more') }}
              </button>
            </div>
            <div v-if="moreActionsOpen" id="quick-view-more-actions" class="flex flex-col rounded-md border border-border">
              <button
                v-if="hasPermission('library_edit_metadata')"
                type="button"
                class="flex min-h-11 items-center gap-3 px-3 text-sm hover:bg-muted transition-colors"
                @click="editMetadata"
              >
                <Pencil class="size-4" />
                {{ t('book.quickView.openMetadataEditor') }}
              </button>
              <button
                v-if="hasPermission('library_delete_books')"
                type="button"
                data-testid="quick-view-action-delete"
                class="flex min-h-11 items-center gap-3 border-t border-border px-3 text-sm text-destructive hover:bg-destructive/10 transition-colors first:border-t-0"
                @click="handleDelete"
              >
                <Trash2 class="size-4" />
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <!-- Cover lightbox -->
    <DialogRoot :open="coverLightboxOpen" @update:open="coverLightboxOpen = $event">
      <DialogPortal>
        <DialogOverlay
          class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 max-w-[90vw] max-h-[90vh] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogTitle class="sr-only">{{
            detail?.title ? t('book.quickView.coverPreviewFor', { title: detail.title }) : t('book.quickView.coverPreview')
          }}</DialogTitle>
          <DialogDescription class="sr-only">{{ t('book.quickView.coverPreviewDescription') }}</DialogDescription>
          <img v-if="detail" :src="coverSrc ?? ''" :alt="detail.title ?? ''" class="max-w-[90vw] max-h-[90vh] rounded-md shadow-2xl object-contain" />
          <DialogClose
            class="absolute -top-3 -right-3 p-1 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <X class="size-4" />
          </DialogClose>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </TooltipProvider>
</template>
