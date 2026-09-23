<script setup lang="ts">
import type { BookCard, BookFileRef } from '@bookorbit/types'
import { getBookMediaProfile } from '@bookorbit/types'
import BookCoverArtwork from './BookCoverArtwork.vue'
import BookCoverSurface from './BookCoverSurface.vue'
import { api } from '@/lib/api'
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useRouter } from 'vue-router'
import {
  BookOpen,
  Check,
  ChevronRight,
  Eye,
  ExternalLink,
  FolderPlus,
  Headphones,
  LibraryBig,
  Loader2,
  FolderInput,
  MoreHorizontal,
  PanelRight,
  Pencil,
  RefreshCw,
  Send,
  Star,
  Trash2,
  TriangleAlert,
} from '@lucide/vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCoverVersions } from '../composables/useCoverVersions'
import { COVER_ASPECT_RATIO_KEY, DEFAULT_COVER_ASPECT_RATIO } from '../lib/cover-aspect-ratio'
import { useRefreshMetadata } from '../composables/useRefreshMetadata'
import { STATUS_COLORS, STATUS_ICONS, useBookStatus } from '../composables/useBookStatus'
import { SWIPE_THRESHOLD_PX, useTouchRowGestures, type LongPressSource } from '../composables/useTouchRowGestures'
import { bookCoverSeed, seriesCoverSeed } from '../lib/cover-seed'
import { decodeHtmlEntities } from '../lib/display-text'
import type { ReadStatus } from '@bookorbit/types'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import SendBookDialog from '@/features/email/components/SendBookDialog.vue'
import { RATING_STARS, getRatingStarClass } from '@/features/book/lib/rating-stars'
import { useDisplaySettings } from '@/composables/useDisplaySettings'
import { displayPublishedDate } from '../lib/published-date'
import { hasReadAlong, READ_ALONG_FORMAT_COLOR, READ_ALONG_FORMAT_TITLE } from '@/features/book/lib/file-capabilities'

const COLLAPSED_SERIES_COVER_LIMIT = 3
const READ_STATUS_KEYS: Record<ReadStatus, string> = {
  unread: 'unread',
  want_to_read: 'wantToRead',
  reading: 'reading',
  on_hold: 'onHold',
  rereading: 'rereading',
  read: 'read',
  skimmed: 'skimmed',
  abandoned: 'abandoned',
}

const { t } = useI18n()
const router = useRouter()

const props = defineProps<{
  book: BookCard
  selectionMode?: boolean
  selected?: boolean
  /** Opt-in: only views that host the destination sheet should offer this. */
  allowMoveToLibrary?: boolean
}>()

type BookActionType = 'quick-view' | 'add-to-collection' | 'move-to-library' | 'delete'
const emit = defineEmits<{
  action: [type: BookActionType]
  select: [event: MouseEvent]
  'rating-change': [rating: number | null]
  'update:book': [updated: BookCard]
}>()

const { hasPermission } = usePermissions()
const { thumbnailClickAction } = useDisplaySettings()
const showSendDialog = ref(false)

const collapsedSeries = computed(() => props.book.collapsedSeries ?? null)
const isCollapsedSeries = computed(() => collapsedSeries.value !== null)
const canOpenSeries = computed(() => isCollapsedSeries.value && props.book.seriesId != null)
const displayTitle = computed(() => decodeHtmlEntities(props.book.title) ?? null)
const displaySeriesName = computed(() => decodeHtmlEntities(props.book.seriesName?.trim()) || null)
const collapsedSeriesName = computed(() => displaySeriesName.value || displayTitle.value?.trim() || t('book.collapsedSeries.label'))
const collapsedCoverSeed = computed(() =>
  props.book.seriesName?.trim() ? seriesCoverSeed(props.book.seriesName) : `series-${props.book.seriesId ?? props.book.id}`,
)
const coverSeed = computed(() => bookCoverSeed(props.book))
const collapsedBookCount = computed(() => collapsedSeries.value?.bookCount ?? 0)
const collapsedReadCount = computed(() => collapsedSeries.value?.readCount ?? 0)
const collapsedCoverIds = computed(
  () => collapsedSeries.value?.coverBookIds.filter((bookId) => bookId > 0).slice(0, COLLAPSED_SERIES_COVER_LIMIT) ?? [],
)
const collapsedCoverIsStacked = computed(() => collapsedCoverIds.value.length > 1)
const collapsedCoverContainerClass = computed(() =>
  collapsedCoverIsStacked.value ? 'flex h-14 w-14 sm:h-20 sm:w-20 shrink-0 items-center' : 'flex h-14 w-9 sm:h-20 sm:w-16 shrink-0 items-center',
)
const collapsedCoverSurfaceClass = computed(() => [
  'book-cover-surface--spine-fitted relative shrink-0 overflow-hidden rounded-sm shadow-sm',
  collapsedCoverIsStacked.value ? '-ml-6.5 sm:-ml-8 first:ml-0 w-9 sm:w-12 ring-1 ring-background/80' : 'w-9 sm:w-16',
])
const collapsedCountLabel = computed(() => t('book.collapsedSeries.bookCount', { count: collapsedBookCount.value }))
const collapsedProgressPercent = computed(() => {
  if (collapsedBookCount.value <= 0) return 0
  return Math.min(100, Math.max(0, (collapsedReadCount.value / collapsedBookCount.value) * 100))
})
const authorLine = computed(() => props.book.authors.join(', ') || null)
const authorQuery = computed(() => props.book.authors[0] ?? null)
const seriesLine = computed(() => {
  if (!displaySeriesName.value) return null
  const idx = props.book.seriesIndex
  return idx != null ? `${displaySeriesName.value} #${idx}` : displaySeriesName.value
})

const isMissing = computed(() => props.book.status === 'missing')
const primaryFile = computed(() => props.book.files.find((f) => f.role === 'primary') ?? props.book.files[0] ?? null)
const mediaProfile = computed(() => getBookMediaProfile(props.book.files))
const isAudiobook = computed(() => mediaProfile.value.primaryMediaKind === 'audiobook')
const isComic = computed(() => mediaProfile.value.primaryMediaKind === 'comic')
const secondaryFiles = computed(() => props.book.files.filter((f) => f !== primaryFile.value))

const uniqueSecondaryFiles = computed(() => {
  const seenFormats = new Set<string>()
  if (primaryFile.value?.format) seenFormats.add(primaryFile.value.format)

  return secondaryFiles.value.filter((f) => {
    const format = f.format
    if (!format) return true
    if (seenFormats.has(format)) return false
    seenFormats.add(format)
    return true
  })
})

const metaLine = computed(() => {
  const parts: string[] = []
  const published = displayPublishedDate(props.book.publishedDate, props.book.publishedYear)
  if (published) parts.push(published)
  if (props.book.language) parts.push(props.book.language.toUpperCase())
  return parts.length > 0 ? parts.join(' · ') : null
})

const publishedLabel = computed(() => displayPublishedDate(props.book.publishedDate, props.book.publishedYear))
const compactMetaLine = computed(() => [seriesLine.value, publishedLabel.value].filter(Boolean).join(' · ') || null)

const visibleTags = computed(() => props.book.genres.slice(0, 2))

const { setStatus } = useBookStatus()
const localReadStatus = ref<ReadStatus | null>(props.book.readStatus?.status ?? null)
watch(
  () => props.book.readStatus?.status,
  (status) => {
    localReadStatus.value = status ?? null
  },
)
const isRead = computed(() => localReadStatus.value === 'read')
const readStatusIcon = computed(() => {
  const status = localReadStatus.value
  if (!status || status === 'unread') return null
  return { icon: STATUS_ICONS[status], colorClass: STATUS_COLORS[status], label: t(`book.readStatus.${READ_STATUS_KEYS[status]}`) }
})
const toggleReadLabel = computed(() => (isRead.value ? t('book.actions.markAsUnread') : t('book.actions.markAsRead')))
const toggleReadIcon = computed(() => (isRead.value ? STATUS_ICONS.unread : STATUS_ICONS.read))

async function toggleRead() {
  const previous = localReadStatus.value
  const next: ReadStatus = previous === 'read' ? 'unread' : 'read'
  localReadStatus.value = next
  try {
    const readStatus = await setStatus(props.book.id, next)
    // Hosts patch their book list so the new state survives a re-render or a remount of this row.
    if (readStatus?.status) emit('update:book', { ...props.book, readStatus })
  } catch {
    localReadStatus.value = previous
    toast.error(t('book.actions.readStatusUpdateFailed'))
  }
}

function handleToggleRead() {
  void toggleRead()
}

const menuOpen = ref(false)

function handleLongPress(source: LongPressSource) {
  if (props.selectionMode) {
    if (source === 'touch') emit('select', new MouseEvent('click', { shiftKey: true }))
    return
  }
  menuOpen.value = true
}

const {
  swipeOffset,
  swiping,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handlePointerCancel,
  handleContextMenu,
  consumeSuppressedClick,
} = useTouchRowGestures({
  onLongPress: handleLongPress,
  onSwipeLeft: handleToggleRead,
  canSwipe: () => !props.selectionMode,
  canLongPress: () => !isCollapsedSeries.value,
})
const swipeArmed = computed(() => swipeOffset.value <= -SWIPE_THRESHOLD_PX)
const swipeStyle = computed(() => (swiping.value ? { transform: `translateX(${swipeOffset.value}px)` } : undefined))

const localRating = ref<number | null>(props.book.rating)
const hoverRating = ref<number | null>(null)
const displayRating = computed(() => hoverRating.value ?? localRating.value)

watch(
  () => props.book.rating,
  (rating) => {
    localRating.value = rating ?? null
  },
)

async function setRating(star: number) {
  const newRating = localRating.value === star ? null : star
  localRating.value = newRating
  emit('rating-change', newRating)
  await api(`/api/v1/books/${props.book.id}/metadata`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: newRating }),
  })
}

const { coverUrl } = useCoverVersions()
const coverSrc = computed(() => coverUrl(props.book.id, 'thumbnail', props.book.updatedAt ?? props.book.addedAt))

const { refreshing, refreshWithFeedback } = useRefreshMetadata()
const injectedCoverAspectRatio = inject(COVER_ASPECT_RATIO_KEY, ref(DEFAULT_COVER_ASPECT_RATIO))
const coverAspectRatio = computed(() => props.book.coverAspectRatio ?? injectedCoverAspectRatio.value)

function openFile(file: BookFileRef, mode?: 'peek') {
  router.push({
    name: 'reader',
    params: { bookId: props.book.id, fileId: file.id },
    query: mode === 'peek' ? { format: file.format ?? 'epub', mode } : { format: file.format ?? 'epub' },
  })
}

function formatButtonClasses(file: BookFileRef, primary: boolean): string {
  if (hasReadAlong(file)) return 'bg-transparent text-white hover:opacity-90 transition-opacity'
  return primary
    ? 'bg-primary/15 text-primary hover:bg-primary/25 transition-colors'
    : 'bg-muted text-muted-foreground hover:bg-muted/70 transition-colors'
}

function formatButtonStyle(file: BookFileRef): Record<string, string> | undefined {
  return hasReadAlong(file) ? { backgroundColor: READ_ALONG_FORMAT_COLOR } : undefined
}

function formatButtonTooltip(file: BookFileRef): string {
  return hasReadAlong(file)
    ? t('book.actions.openReadAlong')
    : t('book.actions.openAs', { format: file.format?.toUpperCase() ?? t('book.unknownFormat') })
}

function peekPrimaryFile() {
  if (!primaryFile.value || isMissing.value) return
  openFile(primaryFile.value, 'peek')
}

function openAuthorBrowse() {
  if (!authorQuery.value) return
  void router.push({ name: 'authors', query: { q: authorQuery.value } })
}

function openBookDetails() {
  void router.push({ name: 'book-detail', params: { bookId: props.book.id } })
}

function openSeriesDetails() {
  if (props.book.seriesId == null) return
  void router.push({ name: 'series-detail', params: { seriesId: props.book.seriesId } })
}

function collapsedCoverVersion(bookId: number): string | null | undefined {
  if (bookId === props.book.id) return props.book.updatedAt ?? props.book.addedAt
  return collapsedSeries.value?.coverUpdatedAtByBookId?.[bookId]
}

function collapsedCoverSrc(bookId: number): string {
  return coverUrl(bookId, 'thumbnail', collapsedCoverVersion(bookId))
}

// Only the representative book's hasCover is known; other ids fall back to the generated cover if their image 404s.
function collapsedCoverHasImage(bookId: number): boolean {
  return bookId !== props.book.id || props.book.hasCover
}

function handleRowClick(event: MouseEvent) {
  if (consumeSuppressedClick()) return
  if (props.selectionMode) {
    if (isCollapsedSeries.value) return
    emit('select', event)
    return
  }

  if (isCollapsedSeries.value) {
    openSeriesDetails()
    return
  }

  if (thumbnailClickAction.value === 'details') {
    openBookDetails()
    return
  }

  emit('action', 'quick-view')
}
</script>

<template>
  <div
    v-if="isCollapsedSeries"
    data-testid="collapsed-series-list-row"
    class="flex items-center gap-3 py-2 sm:py-3 px-2 rounded-md transition-colors"
    :class="[
      selectionMode ? 'cursor-default select-none' : canOpenSeries ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default',
      selected ? 'bg-primary/8 ring-1 ring-primary/30' : '',
    ]"
    @click="handleRowClick"
  >
    <div :class="collapsedCoverContainerClass">
      <template v-if="collapsedCoverIds.length > 0">
        <BookCoverSurface
          v-for="bookId in collapsedCoverIds"
          :key="bookId"
          data-testid="collapsed-series-cover"
          size="mini"
          :class="collapsedCoverSurfaceClass"
          :disable-spine="isAudiobook"
          :is-comic="isComic"
          :style="{ aspectRatio: coverAspectRatio }"
        >
          <BookCoverArtwork
            :src="collapsedCoverSrc(bookId)"
            :has-cover="collapsedCoverHasImage(bookId)"
            :title="collapsedSeriesName"
            :author-line="authorLine"
            :is-audio="isAudiobook"
            :seed="collapsedCoverSeed"
            mode="fill-crop"
            alt=""
            :spine="false"
            :is-comic="isComic"
          />
        </BookCoverSurface>
      </template>
      <BookCoverSurface
        v-else
        data-testid="collapsed-series-cover-fallback"
        size="mini"
        :class="collapsedCoverSurfaceClass"
        :disable-spine="isAudiobook"
        :is-comic="isComic"
        :style="{ aspectRatio: coverAspectRatio }"
      >
        <BookCoverArtwork
          :src="null"
          :has-cover="false"
          :title="collapsedSeriesName"
          :author-line="authorLine"
          :is-audio="isAudiobook"
          :seed="collapsedCoverSeed"
          alt=""
          :spine="!isAudiobook"
          :is-comic="isComic"
        />
      </BookCoverSurface>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex min-w-0 items-center gap-2">
        <span class="truncate text-sm font-semibold leading-snug text-foreground">{{ collapsedSeriesName }}</span>
        <span class="hidden shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary sm:inline-flex">
          {{ t('book.collapsedSeries.label') }}
        </span>
      </div>
      <button v-if="authorLine" class="w-fit max-w-full truncate text-xs text-muted-foreground hover:underline" @click.stop="openAuthorBrowse">
        {{ authorLine }}
      </button>
      <div class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <LibraryBig class="size-3.5 shrink-0 text-muted-foreground" />
        <span class="truncate">{{ collapsedCountLabel }}</span>
        <span v-if="collapsedReadCount > 0" class="shrink-0">
          &middot; {{ t('book.collapsedSeries.readCount', { count: collapsedReadCount }, collapsedReadCount) }}
        </span>
      </div>
      <div
        v-if="collapsedReadCount > 0 && collapsedBookCount > 0"
        data-testid="collapsed-series-progress"
        class="mt-1 h-1 w-32 max-w-full overflow-hidden rounded-full bg-muted"
      >
        <div class="h-full rounded-full bg-primary/60 transition-all" :style="{ width: `${collapsedProgressPercent}%` }" />
      </div>
    </div>

    <div v-if="!selectionMode" class="flex shrink-0 items-center gap-2">
      <ChevronRight class="size-4 text-muted-foreground transition-colors" />
    </div>
  </div>
  <div v-else class="relative overflow-hidden rounded-md" data-testid="book-list-row">
    <div
      v-if="swiping"
      data-testid="book-list-row-swipe-action"
      class="absolute inset-0 flex items-center justify-end gap-2 rounded-md px-4 text-sm font-medium transition-colors"
      :class="swipeArmed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
      aria-hidden="true"
    >
      <component :is="toggleReadIcon" class="size-4" />
      <span>{{ toggleReadLabel }}</span>
    </div>
    <div
      class="relative flex items-center gap-3 py-2 sm:py-3 px-2 rounded-md cursor-pointer touch-pan-y touch-pinch-zoom [-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none"
      :class="[
        swiping ? 'bg-background' : 'transition-[background-color,transform] duration-200',
        selectionMode ? 'cursor-pointer select-none' : '',
        selected ? 'bg-primary/8 ring-1 ring-inset ring-primary/30' : '',
        isMissing ? 'grayscale opacity-60' : 'hover:bg-muted/50',
      ]"
      :style="swipeStyle"
      @click="handleRowClick"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerCancel"
      @contextmenu="handleContextMenu"
    >
      <!-- Selection checkbox -->
      <div
        v-if="selectionMode"
        data-testid="book-selection-checkbox"
        class="h-5 w-5 rounded shrink-0 flex items-center justify-center transition-colors"
        :class="selected ? 'bg-primary' : 'border border-border bg-background'"
      >
        <Check v-if="selected" class="text-primary-foreground" :size="12" />
      </div>

      <!-- Cover -->
      <BookCoverSurface
        size="mini"
        class="book-cover-surface--spine-fitted w-9 sm:w-16 rounded shrink-0 overflow-hidden relative"
        :disable-spine="isAudiobook"
        :is-comic="isComic"
        :class="isMissing ? 'opacity-50 grayscale' : ''"
        :style="{ aspectRatio: coverAspectRatio }"
      >
        <BookCoverArtwork
          :src="coverSrc"
          :has-cover="book.hasCover"
          :title="displayTitle"
          :author-line="authorLine"
          :is-audio="isAudiobook"
          :seed="coverSeed"
          :alt="displayTitle ?? ''"
          backdrop-class="blur-md brightness-50"
          :spine="!isAudiobook"
          :is-comic="isComic"
        />
      </BookCoverSurface>

      <!-- Main info -->
      <div class="flex flex-col min-w-0 flex-1 gap-0.5">
        <div class="flex min-w-0 items-center gap-1.5">
          <component
            :is="readStatusIcon.icon"
            v-if="readStatusIcon"
            data-testid="book-list-row-read-status"
            class="size-3.5 shrink-0"
            :class="readStatusIcon.colorClass"
            :aria-label="readStatusIcon.label"
            role="img"
          />
          <span class="text-sm font-medium text-foreground truncate leading-snug" :class="isMissing ? 'opacity-60' : ''">{{
            displayTitle ?? '-'
          }}</span>
        </div>
        <span v-if="compactMetaLine" data-testid="book-list-row-compact-meta" class="text-xs text-muted-foreground truncate sm:hidden">{{
          compactMetaLine
        }}</span>
        <button
          v-if="authorLine"
          class="hidden sm:block w-fit max-w-full text-xs text-muted-foreground truncate hover:underline"
          @click.stop="openAuthorBrowse"
        >
          {{ authorLine }}
        </button>
        <span v-if="seriesLine" class="hidden sm:block text-xs text-muted-foreground truncate italic">{{ seriesLine }}</span>
        <span v-if="metaLine" class="hidden sm:block text-xs text-muted-foreground truncate">{{ metaLine }}</span>
        <div v-if="visibleTags.length > 0" class="hidden sm:flex items-center gap-1 flex-wrap">
          <span v-for="tag in visibleTags" :key="tag" class="text-[11px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground leading-5">{{
            tag
          }}</span>
        </div>
        <!-- Reading progress -->
        <div v-if="book.readingProgress != null && book.readingProgress > 0" class="mt-1">
          <div class="h-1 w-24 rounded-full bg-muted overflow-hidden">
            <div class="h-full rounded-full bg-primary/60 transition-all" :style="{ width: `${book.readingProgress}%` }" />
          </div>
        </div>
      </div>

      <!-- Right badges + actions -->
      <div v-if="!selectionMode" class="flex items-center gap-1.5 shrink-0" @click.stop>
        <!-- Star rating -->
        <div class="hidden sm:flex items-center gap-0.5" @mouseleave="hoverRating = null">
          <Tooltip v-for="star in RATING_STARS" :key="star">
            <TooltipTrigger as-child>
              <button class="p-0.5 transition-colors" @mouseenter="hoverRating = star" @click="setRating(star)">
                <Star class="size-3" :class="getRatingStarClass(star, displayRating)" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{{ t('book.actions.rate', { star }) }}</TooltipContent>
          </Tooltip>
        </div>

        <!-- Format badges: hidden on phones, where nearly every row repeats the same format -->
        <div class="flex items-center gap-1">
          <span
            v-if="isMissing"
            class="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400"
          >
            <TriangleAlert class="size-3 shrink-0" />
            <span class="hidden sm:inline">{{ t('book.card.missing') }}</span>
          </span>
          <Tooltip v-if="primaryFile && !isMissing">
            <TooltipTrigger as-child>
              <button
                class="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                :class="formatButtonClasses(primaryFile, true)"
                :style="formatButtonStyle(primaryFile)"
                :title="hasReadAlong(primaryFile) ? READ_ALONG_FORMAT_TITLE : undefined"
                @click="openFile(primaryFile)"
              >
                {{ primaryFile.format ?? '?' }}
                <Headphones v-if="hasReadAlong(primaryFile)" class="size-2.5 shrink-0" :stroke-width="2.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{{ formatButtonTooltip(primaryFile) }}</TooltipContent>
          </Tooltip>
          <Tooltip v-for="file in uniqueSecondaryFiles" :key="file.id">
            <TooltipTrigger as-child>
              <button
                class="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                :class="formatButtonClasses(file, false)"
                :style="formatButtonStyle(file)"
                :title="hasReadAlong(file) ? READ_ALONG_FORMAT_TITLE : undefined"
                @click="openFile(file)"
              >
                {{ file.format ?? '?' }}
                <Headphones v-if="hasReadAlong(file)" class="size-2.5 shrink-0" :stroke-width="2.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{{ formatButtonTooltip(file) }}</TooltipContent>
          </Tooltip>
        </div>

        <DropdownMenu v-model:open="menuOpen">
          <DropdownMenuTrigger as-child>
            <button
              data-testid="book-list-row-menu"
              class="-my-2 -mr-1 flex size-11 items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground sm:m-0 sm:size-auto sm:p-1"
              :aria-label="t('book.actions.moreActions', { title: displayTitle ?? '' })"
            >
              <MoreHorizontal class="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem :disabled="!primaryFile || isMissing" @click="primaryFile && !isMissing && openFile(primaryFile)">
              <BookOpen class="size-4 mr-2" />
              {{ t('book.actions.read') }}
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="!primaryFile || isMissing" @click="peekPrimaryFile">
              <Eye class="size-4 mr-2" />
              {{ t('book.actions.peek') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('action', 'quick-view')">
              <PanelRight class="size-4 mr-2" />
              {{ t('book.actions.quickView') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="openBookDetails">
              <ExternalLink class="size-4 mr-2" />
              {{ t('book.actions.bookDetails') }}
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="book-list-row-toggle-read" @click="handleToggleRead">
              <component :is="toggleReadIcon" class="size-4 mr-2" />
              {{ toggleReadLabel }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              v-if="hasPermission('library_edit_metadata')"
              @click="router.push({ name: 'book-detail', params: { bookId: book.id }, query: { tab: 'edit' } })"
            >
              <Pencil class="size-4 mr-2" />
              {{ t('book.actions.editMetadata') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="hasPermission('library_edit_metadata')" :disabled="refreshing" @click="refreshWithFeedback(book.id)">
              <Loader2 v-if="refreshing" class="size-4 mr-2 animate-spin" />
              <RefreshCw v-else class="size-4 mr-2" />
              {{ t('book.actions.refreshMetadata') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="allowMoveToLibrary && hasPermission('library_edit_metadata')" @click="emit('action', 'move-to-library')">
              <FolderInput class="size-4 mr-2" />
              {{ t('book.move.action') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('action', 'add-to-collection')">
              <FolderPlus class="size-4 mr-2" />
              {{ t('book.actions.addToCollection') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="hasPermission('email_send')" @click="showSendDialog = true">
              <Send class="size-4 mr-2" />
              {{ t('book.actions.sendViaEmail') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator v-if="hasPermission('library_delete_books')" />
            <DropdownMenuItem
              v-if="hasPermission('library_delete_books')"
              class="text-destructive focus:text-destructive"
              @click="emit('action', 'delete')"
            >
              <Trash2 class="size-4 mr-2" />
              {{ t('common.delete') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </div>

  <SendBookDialog
    v-if="showSendDialog"
    :open="showSendDialog"
    :selection-payload="{ bookIds: [book.id] }"
    :selected-count="1"
    :book-files="book.files"
    :book-title="displayTitle ?? undefined"
    @update:open="showSendDialog = $event"
  />
</template>
