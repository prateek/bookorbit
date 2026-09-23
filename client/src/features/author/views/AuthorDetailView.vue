<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatNumber } from '@/i18n/formatters'
import { useRoute, useRouter } from 'vue-router'
import { ArrowUpDown, Check, ChevronDown, ChevronLeft, ImageMinus, Layers, LayoutGrid, List, Upload } from '@lucide/vue'
import { toast } from 'vue-sonner'

import type { AuthorDetail, AuthorSummary, BookCard } from '@bookorbit/types'
import VirtualBookGrid from '@/features/book/components/VirtualBookGrid.vue'
import BookListRow from '@/features/book/components/BookListRow.vue'
import DeleteBookDialog from '@/features/book/components/DeleteBookDialog.vue'
import { useScrollRestoreOnActivate } from '@/features/book/composables/useScrollRestoreOnActivate'
import { useSeriesCollapsePreference } from '@/features/book/composables/useSeriesCollapsePreference'
import { useDisplaySettings } from '@/composables/useDisplaySettings'
import { useLibraries } from '@/features/library/composables/useLibraries'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { usePageTitle } from '@/composables/usePageTitle'
import { useDeleteBook } from '@/features/book/composables/useDeleteBook'
import AuthorHeader from '../components/AuthorHeader.vue'
import AuthorConfirmDialog from '../components/AuthorConfirmDialog.vue'
import {
  deleteAuthorImage,
  deleteAuthors,
  fetchAuthors,
  mergeAuthors,
  MAX_AUTHOR_IMAGE_BYTES,
  refreshAuthorMetadata,
  updateAuthor,
  uploadAuthorImage,
} from '../api/author'
import { useAuthorBooks } from '../composables/useAuthorBooks'
import { useAuthorDetail } from '../composables/useAuthorDetail'
import { useAuthorMetadataPreview } from '../composables/useAuthorMetadataPreview'
import { useSeriesContinue } from '../composables/useSeriesContinue'
import AuthorSeriesRow from '../components/AuthorSeriesRow.vue'
import { isSerialAuthor } from '../lib/author-work'
import EntityNotFound from '@/components/EntityNotFound.vue'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const mainRef = ref<HTMLElement | null>(null)
useScrollRestoreOnActivate(mainRef)
const { hasPermission, isSuperuser } = usePermissions()
const { width: windowWidth } = useWindowSize()
const isMobileLayout = computed(() => windowWidth.value < 640)

const { portraitCoverSize, gridGap } = useDisplaySettings()
const { libraries, fetchLibraries } = useLibraries()

type AuthorBooksViewMode = 'grid' | 'list'

/**
 * Phones open on list rows, where a serial shows its unread count and a Continue button;
 * wider screens open on the cover grid. A choice made on either is remembered for that form
 * factor only, so picking grid on a desktop does not turn the phone back into covers.
 */
const VIEW_MODE_STORAGE_KEY = 'bookorbit:author-books-view-mode'
const viewModeFormFactor = computed(() => (isMobileLayout.value ? 'phone' : 'wide'))

function readStoredViewMode(formFactor: string): AuthorBooksViewMode | null {
  try {
    const value = window.localStorage.getItem(`${VIEW_MODE_STORAGE_KEY}:${formFactor}`)
    return value === 'grid' || value === 'list' ? value : null
  } catch {
    return null
  }
}

const storedViewModes = ref<Record<string, AuthorBooksViewMode | null>>({
  phone: readStoredViewMode('phone'),
  wide: readStoredViewMode('wide'),
})

const authorBooksViewMode = computed<AuthorBooksViewMode>(
  () => storedViewModes.value[viewModeFormFactor.value] ?? (isMobileLayout.value ? 'list' : 'grid'),
)

function setAuthorBooksViewMode(mode: AuthorBooksViewMode) {
  const formFactor = viewModeFormFactor.value
  storedViewModes.value = { ...storedViewModes.value, [formFactor]: mode }
  try {
    window.localStorage.setItem(`${VIEW_MODE_STORAGE_KEY}:${formFactor}`, mode)
  } catch {
    // Private windows can refuse storage; the choice still holds for this visit.
  }
}

function showGridView() {
  setAuthorBooksViewMode('grid')
}

function showListView() {
  setAuthorBooksViewMode('list')
}

const authorId = computed(() => Number(route.params.id))
const { author, loading: loadingAuthor, error: authorError, notFound: authorNotFound, load: loadAuthor } = useAuthorDetail(authorId)
const {
  items: books,
  total,
  bookTotal,
  loading: loadingBooks,
  error: booksError,
  hasMore,
  sort,
  order,
  libraryId,
  collapseSeries,
  load: loadBooks,
} = useAuthorBooks(authorId)

// One flag for every author page, so the state carries from one author to the next rather than
// being re-chosen per author; the toggle below writes it back. Tracked rather than read once,
// because on a cold load of an author URL the signed-in user - and so the preference - can
// arrive after this component is set up. Phones always group by series: a flat list of a serial
// writer's thousand chapters is not something anyone scrolls on a phone.
const { getEffectivePreference, setPreference } = useSeriesCollapsePreference()
watch(
  () => isMobileLayout.value || getEffectivePreference({ authorPages: true }),
  (value) => (collapseSeries.value = value),
  { immediate: true },
)
const serialAuthor = computed(() => (author.value ? isSerialAuthor(author.value) : false))
const { continuingSeriesId, continueSeries } = useSeriesContinue()
const authorName = computed(() => author.value?.name ?? '')
const pageTitle = computed(() => {
  if (author.value?.name) return t('author.detail.pageTitleNamed', { name: author.value.name })
  return Number.isFinite(authorId.value) ? t('author.detail.pageTitleId', { id: authorId.value }) : t('author.detail.pageTitle')
})
usePageTitle(pageTitle)
const {
  preview: metadataPreview,
  loading: loadingMetadataPreview,
  error: metadataPreviewError,
  cancel: cancelMetadataPreview,
  load: loadMetadataPreview,
} = useAuthorMetadataPreview(authorName)

const canUpdate = computed(() => hasPermission('library_edit_metadata'))
const canMerge = computed(() => isSuperuser.value)
const canDelete = computed(() => isSuperuser.value)

const editOpen = ref(false)
const mergeOpen = ref(false)
const confirmMergeOpen = ref(false)
const confirmDeleteOpen = ref(false)
const savingEdit = ref(false)
const merging = ref(false)
const deleting = ref(false)
const refreshingMetadata = ref(false)
const uploadingImage = ref(false)
const removingImage = ref(false)
const authorImageInput = ref<HTMLInputElement | null>(null)

const draftName = ref('')
const draftSortName = ref('')
const draftDescription = ref('')
const seededDrafts = ref<{ name: string; sortName: string; description: string } | null>(null)
const authorImageBusy = computed(() => uploadingImage.value || removingImage.value)

const draftsDirty = computed(() => {
  const seeded = seededDrafts.value
  if (!seeded) return false
  return draftName.value !== seeded.name || draftSortName.value !== seeded.sortName || draftDescription.value !== seeded.description
})

const mergeQuery = ref('')
const mergeCandidates = ref<AuthorSummary[]>([])
const selectedMergeIds = ref<number[]>([])
const searchingMergeCandidates = ref(false)
let mergeSearchTimer: ReturnType<typeof setTimeout> | null = null

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const selectedMergeBookCount = computed(() => {
  const selected = new Set(selectedMergeIds.value)
  return mergeCandidates.value.filter((candidate) => selected.has(candidate.id)).reduce((sum, candidate) => sum + candidate.bookCount, 0)
})

/** The phone sort sheet offers whole orderings, so a field and a direction are one tap rather than two controls. */
const SORT_CHOICES = [
  { sort: 'addedAt', order: 'desc', label: 'author.detail.books.sortOptions.recent' },
  { sort: 'addedAt', order: 'asc', label: 'author.detail.books.sortOptions.oldest' },
  { sort: 'title', order: 'asc', label: 'author.detail.books.sortOptions.title' },
  { sort: 'publishedYear', order: 'desc', label: 'author.detail.books.sortOptions.published' },
] as const
type SortChoice = (typeof SORT_CHOICES)[number]

const sortSheetOpen = ref(false)
const showLibraryFilter = computed(() => libraries.value.length > 1)

function isActiveSortChoice(choice: SortChoice): boolean {
  return sort.value === choice.sort && order.value === choice.order
}

function applySortChoice(choice: SortChoice) {
  sort.value = choice.sort
  order.value = choice.order
  sortSheetOpen.value = false
}

function openSortSheet() {
  sortSheetOpen.value = true
}

function openSeries(book: BookCard) {
  if (book.seriesId == null) return
  void router.push({ name: 'series-detail', params: { seriesId: book.seriesId }, query: { from: route.fullPath } })
}

// 'move-to-library' is part of the shared card contract; this view does not
// opt in, so it never fires here.
type BookActionType = 'quick-view' | 'edit-metadata' | 'add-to-collection' | 'move-to-library' | 'delete'

const {
  pendingId: deleteBookId,
  deleting: deletingBook,
  promptDelete,
  cancelDelete,
  confirmDelete,
} = useDeleteBook((id) => {
  const previousLength = books.value.length
  books.value = books.value.filter((b) => b.id !== id)
  if (books.value.length === previousLength) return

  // Only a plain book card carries a delete action - a collapsed series row opens the series
  // instead - so the card that just went is worth exactly one row and one book.
  total.value = Math.max(0, total.value - 1)
  bookTotal.value = Math.max(0, bookTotal.value - 1)
  if (author.value) {
    author.value = {
      ...author.value,
      bookCount: Math.max(0, author.value.bookCount - 1),
    }
  }
})

function showRefreshResultToast(updated: { imageUrl?: string | null }) {
  if (!updated.imageUrl) {
    toast.warning(t('author.detail.toast.refreshedNoImage'))
    return
  }
  toast.success(t('author.detail.toast.refreshed'))
}

function seedDrafts(value: AuthorDetail | null) {
  const seeded = {
    name: value?.name ?? '',
    sortName: value?.sortName ?? '',
    description: value?.description ?? '',
  }
  draftName.value = seeded.name
  draftSortName.value = seeded.sortName
  draftDescription.value = seeded.description
  seededDrafts.value = seeded
}

// Image uploads, image removal and metadata refresh all replace the whole author
// object, so re-seeding on every change would discard edits typed but not saved.
watch(
  author,
  (value, previous) => {
    const sameAuthor = previous != null && value != null && previous.id === value.id
    if (sameAuthor && draftsDirty.value) return
    seedDrafts(value)
  },
  { immediate: true },
)

function goBack() {
  const from = typeof route.query.from === 'string' ? route.query.from : ''
  if (from.startsWith('/authors')) {
    void router.push(from)
    return
  }
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.push({ name: 'authors' })
}

function toggleEdit() {
  editOpen.value = !editOpen.value
  if (editOpen.value) mergeOpen.value = false
}

function toggleMerge() {
  mergeOpen.value = !mergeOpen.value
  if (mergeOpen.value) editOpen.value = false
}

function handleBookAction(book: BookCard, action: BookActionType) {
  if (action === 'quick-view') {
    void router.push({ name: 'book-detail', params: { bookId: book.id } })
    return
  }

  if (action === 'delete') {
    promptDelete(book.id)
  }
}

function handleBookUpdate(updated: BookCard) {
  const idx = books.value.findIndex((b) => b.id === updated.id)
  if (idx !== -1) books.value = books.value.map((b, i) => (i === idx ? updated : b))
}

const collapseToggleLabel = computed(() => (collapseSeries.value ? t('views.bookView.expandSeries') : t('views.bookView.collapseSeries')))

async function handleToggleCollapse() {
  const next = !collapseSeries.value
  collapseSeries.value = next
  await setPreference({ authorPages: true }, next)
}

function loadIfSentinelVisible() {
  if (loadingBooks.value || !hasMore.value || !sentinel.value) return
  if (sentinel.value.getBoundingClientRect().top < window.innerHeight + 250) {
    void loadBooks()
  }
}

async function saveAuthorEdits() {
  if (!author.value || savingEdit.value) return
  const name = draftName.value.trim()
  if (!name) {
    toast.error(t('author.detail.toast.nameRequired'))
    return
  }

  savingEdit.value = true
  try {
    const updated = await updateAuthor(author.value.id, {
      name,
      sortName: draftSortName.value.trim() || null,
      description: draftDescription.value.trim() || null,
    })
    author.value = updated
    seedDrafts(updated)
    editOpen.value = false
    toast.success(t('author.detail.toast.updated'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('author.detail.toast.updateFailed'))
  } finally {
    savingEdit.value = false
  }
}

function openAuthorImagePicker() {
  if (!author.value || authorImageBusy.value) return
  authorImageInput.value?.click()
}

async function onAuthorImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !author.value || authorImageBusy.value) return

  uploadingImage.value = true
  try {
    const updated = await uploadAuthorImage(author.value.id, file)
    author.value = updated
    toast.success(t('author.detail.toast.imageUpdated'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('author.detail.toast.imageUploadFailed'))
  } finally {
    uploadingImage.value = false
  }
}

async function removeAuthorImage() {
  if (!author.value || authorImageBusy.value || !author.value.imageUrl) return

  removingImage.value = true
  try {
    const updated = await deleteAuthorImage(author.value.id)
    author.value = updated
    toast.success(t('author.detail.toast.imageRemoved'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('author.detail.toast.imageRemoveFailed'))
  } finally {
    removingImage.value = false
  }
}

async function searchMergeCandidates() {
  if (!mergeOpen.value || !mergeQuery.value.trim()) {
    mergeCandidates.value = []
    return
  }

  searchingMergeCandidates.value = true
  try {
    const page = await fetchAuthors({
      q: mergeQuery.value.trim(),
      page: 0,
      size: 20,
      sort: 'name',
      order: 'asc',
      libraryId: null,
    })

    mergeCandidates.value = page.items.filter((candidate) => candidate.id !== authorId.value)
  } catch {
    mergeCandidates.value = []
  } finally {
    searchingMergeCandidates.value = false
  }
}

function toggleMergeCandidate(candidateId: number, checked: boolean) {
  const current = new Set(selectedMergeIds.value)
  if (checked) current.add(candidateId)
  else current.delete(candidateId)
  selectedMergeIds.value = [...current]
}

function onMergeCandidateToggle(candidateId: number, event: Event) {
  const target = event.target as HTMLInputElement | null
  toggleMergeCandidate(candidateId, target?.checked ?? false)
}

async function runMerge() {
  if (!author.value || merging.value || selectedMergeIds.value.length === 0) return

  confirmMergeOpen.value = false
  merging.value = true
  try {
    const result = await mergeAuthors({
      targetAuthorId: author.value.id,
      sourceAuthorIds: selectedMergeIds.value,
    })

    author.value = result.target
    selectedMergeIds.value = []
    mergeCandidates.value = []
    mergeQuery.value = ''
    mergeOpen.value = false

    await loadBooks(true)
    toast.success(t('author.detail.toast.mergeSuccess', { count: result.mergedAuthorIds.length, books: result.affectedBookCount }))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('author.detail.toast.mergeFailed'))
  } finally {
    merging.value = false
  }
}

async function runDelete() {
  if (!author.value || deleting.value) return

  confirmDeleteOpen.value = false
  deleting.value = true
  try {
    const result = await deleteAuthors({ authorIds: [author.value.id] })
    toast.success(t('author.detail.toast.deleteSuccess', { books: result.affectedBookCount }))
    await router.push({ name: 'authors' })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('author.detail.toast.deleteFailed'))
  } finally {
    deleting.value = false
  }
}

function promptRunMerge() {
  if (!author.value || merging.value || selectedMergeIds.value.length === 0) return
  confirmMergeOpen.value = true
}

const mergeDialogTitle = computed(() => {
  if (!author.value) return t('author.detail.mergeDialog.titleFallback')
  return t('author.detail.mergeDialog.title', { count: selectedMergeIds.value.length, name: author.value.name })
})

const mergeDialogDescription = computed(() => {
  if (selectedMergeIds.value.length === 0) return t('author.detail.mergeDialog.descriptionEmpty')
  return t('author.detail.mergeDialog.description')
})

const authorBookCoverSize = computed(() => {
  const configuredSize = Number(portraitCoverSize.value)
  const normalizedSize = Number.isFinite(configuredSize) && configuredSize > 0 ? configuredSize : 130
  if (!isMobileLayout.value) return normalizedSize
  return Math.min(normalizedSize, 110)
})
const authorBookGridGap = computed(() => {
  const configuredGap = Number(gridGap.value)
  const normalizedGap = Number.isFinite(configuredGap) && configuredGap > 0 ? configuredGap : 20
  if (!isMobileLayout.value) return normalizedGap
  return Math.min(normalizedGap, 12)
})

function onLibraryFilterChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  libraryId.value = value ? Number(value) : null
}

async function refreshMetadata() {
  if (!author.value || refreshingMetadata.value) return
  refreshingMetadata.value = true
  try {
    const updated = await refreshAuthorMetadata(author.value.id)
    author.value = updated
    await loadMetadataPreview()
    showRefreshResultToast(updated)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('author.detail.toast.refreshFailed'))
  } finally {
    refreshingMetadata.value = false
  }
}

onMounted(async () => {
  await fetchLibraries()
  await Promise.all([loadAuthor(), loadBooks(true)])

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !loadingBooks.value && hasMore.value) {
        void loadBooks()
      }
    },
    { rootMargin: '280px' },
  )

  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => {
  observer?.disconnect()
  if (mergeSearchTimer) clearTimeout(mergeSearchTimer)
  cancelMetadataPreview()
})

watch(authorId, () => {
  selectedMergeIds.value = []
  mergeCandidates.value = []
  mergeQuery.value = ''
  void Promise.all([loadAuthor(), loadBooks(true)]).then(() => loadMetadataPreview())
})

watch([sort, order, libraryId, collapseSeries], () => {
  void loadBooks(true)
})

watch(mergeQuery, () => {
  if (mergeSearchTimer) clearTimeout(mergeSearchTimer)
  mergeSearchTimer = setTimeout(() => {
    void searchMergeCandidates()
  }, 220)
})

watch(
  loadingBooks,
  (isLoading) => {
    if (!isLoading) loadIfSentinelVisible()
  },
  { flush: 'post' },
)

watch(authorName, () => {
  void loadMetadataPreview()
})

defineOptions({ name: 'AuthorDetailView' })
</script>

<template>
  <div class="flex h-full flex-col">
    <main ref="mainRef" class="flex flex-1 min-h-0 w-full min-w-0 flex-col overflow-y-auto overflow-x-hidden pr-0 sm:pr-2">
      <!-- Grown in layout rather than with touch-target: the scroller clips an overlay reaching above it. -->
      <div class="mb-2 mt-1 flex items-center px-1 pointer-coarse:mb-0 pointer-coarse:mt-0">
        <button
          class="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:pr-4"
          @click="goBack"
        >
          <ChevronLeft :size="16" />
          {{ t('common.back') }}
        </button>
      </div>

      <div v-if="authorNotFound">
        <EntityNotFound :entity="t('author.detail.entityName')" />
      </div>

      <template v-else>
        <div v-if="authorError" class="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {{ authorError }}
        </div>

        <div v-if="loadingAuthor && !author" class="mb-4 rounded-lg border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground">
          {{ t('author.detail.loadingAuthor') }}
        </div>
        <AuthorHeader
          v-else-if="author"
          :author="author"
          :image-url="author.imageUrl ?? metadataPreview?.imageUrl ?? null"
          :preview-description="metadataPreview?.description ?? null"
          :preview-provider="metadataPreview?.provider ?? null"
          :loading-preview="loadingMetadataPreview"
          :can-update="canUpdate"
          :can-merge="canMerge"
          :can-delete="canDelete"
          :refreshing="refreshingMetadata"
          @edit="toggleEdit"
          @merge="toggleMerge"
          @refresh="refreshMetadata"
          @delete="confirmDeleteOpen = true"
        />

        <div v-if="metadataPreviewError" class="mt-3 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {{ t('author.detail.previewError') }}
        </div>

        <section v-if="author && (editOpen || mergeOpen)" class="mt-4 rounded-lg border border-border/70 bg-card/60 p-3 space-y-3">
          <div v-if="editOpen && canUpdate" class="space-y-2">
            <div class="grid gap-2 md:grid-cols-2">
              <label class="text-xs text-muted-foreground">
                {{ t('author.detail.edit.name') }}
                <input v-model="draftName" class="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
              </label>
              <label class="text-xs text-muted-foreground">
                {{ t('author.detail.edit.sortName') }}
                <input v-model="draftSortName" class="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
              </label>
            </div>
            <label class="block text-xs text-muted-foreground">
              {{ t('author.detail.edit.description') }}
              <textarea v-model="draftDescription" rows="3" class="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm" />
            </label>
            <div class="space-y-1.5">
              <p class="text-xs text-muted-foreground">{{ t('author.detail.edit.image') }}</p>
              <input ref="authorImageInput" type="file" accept="image/*" class="hidden" :disabled="authorImageBusy" @change="onAuthorImageSelected" />
              <div class="flex flex-wrap items-center gap-2">
                <button
                  :disabled="authorImageBusy"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  @click="openAuthorImagePicker"
                >
                  <Upload :size="14" />
                  {{
                    uploadingImage
                      ? t('author.detail.edit.uploading')
                      : author?.imageUrl
                        ? t('author.detail.edit.replaceImage')
                        : t('author.detail.edit.uploadImage')
                  }}
                </button>
                <button
                  :disabled="authorImageBusy || !author?.imageUrl"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  @click="removeAuthorImage"
                >
                  <ImageMinus :size="14" />
                  {{ removingImage ? t('author.detail.edit.removing') : t('author.detail.edit.removeImage') }}
                </button>
              </div>
              <p class="text-[11px] text-muted-foreground">
                {{ t('author.detail.edit.imageHint', { size: Math.floor(MAX_AUTHOR_IMAGE_BYTES / 1024 / 1024) }) }}
              </p>
            </div>
            <div class="flex items-center justify-end gap-2">
              <button class="h-8 rounded-md border border-input px-3 text-sm text-muted-foreground hover:bg-muted" @click="editOpen = false">
                {{ t('common.cancel') }}
              </button>
              <button
                :disabled="savingEdit"
                class="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
                @click="saveAuthorEdits"
              >
                {{ savingEdit ? t('author.detail.edit.saving') : t('common.save') }}
              </button>
            </div>
          </div>

          <div v-if="mergeOpen && canMerge" class="space-y-2">
            <input
              v-model="mergeQuery"
              class="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              :placeholder="t('author.detail.merge.searchPlaceholder')"
            />

            <div v-if="searchingMergeCandidates" class="text-xs text-muted-foreground">{{ t('author.detail.merge.searching') }}</div>

            <div v-if="mergeCandidates.length > 0" class="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/70 bg-background/50 p-2">
              <label v-for="candidate in mergeCandidates" :key="candidate.id" class="flex items-center gap-2 text-sm">
                <input type="checkbox" :checked="selectedMergeIds.includes(candidate.id)" @change="onMergeCandidateToggle(candidate.id, $event)" />
                <span class="min-w-0 flex-1 truncate">{{ candidate.name }}</span>
                <span class="text-xs text-muted-foreground">{{ t('author.detail.merge.bookCount', { count: candidate.bookCount }) }}</span>
              </label>
            </div>

            <div v-if="selectedMergeIds.length > 0" class="text-xs text-muted-foreground">
              {{ t('author.detail.merge.selectedSummary', { count: selectedMergeIds.length, books: selectedMergeBookCount }) }}
            </div>

            <div class="flex items-center justify-end">
              <button
                :disabled="merging || selectedMergeIds.length === 0"
                class="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
                @click="promptRunMerge"
              >
                {{ merging ? t('author.detail.merge.merging') : t('author.detail.merge.mergeSelected') }}
              </button>
            </div>
          </div>
        </section>

        <section class="mt-3 sm:mt-4 sm:rounded-lg sm:border sm:border-border/70 sm:bg-card/60 sm:p-3">
          <div class="mb-2 flex flex-col gap-2 sm:mb-3 md:flex-row md:items-center md:justify-between">
            <div class="flex items-center gap-2 sm:hidden">
              <h2 class="min-w-0 flex-1 px-1 text-[17px] font-semibold text-foreground">
                {{ serialAuthor ? t('author.detail.books.headingSerials') : t('author.detail.books.heading') }}
                <span v-if="total > 0" class="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{{ formatNumber(total) }}</span>
              </h2>
              <button
                type="button"
                data-testid="author-books-sort-trigger"
                class="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                @click="openSortSheet"
              >
                <ArrowUpDown :size="16" aria-hidden="true" />
                {{ t('author.detail.books.sortButton') }}
              </button>
              <div class="flex shrink-0 items-center" role="group">
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full transition-colors"
                  :class="
                    authorBooksViewMode === 'list' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  "
                  :aria-label="t('author.detail.books.viewList')"
                  :aria-pressed="authorBooksViewMode === 'list'"
                  @click="showListView"
                >
                  <List :size="18" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full transition-colors"
                  :class="
                    authorBooksViewMode === 'grid' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  "
                  :aria-label="t('author.detail.books.viewGrid')"
                  :aria-pressed="authorBooksViewMode === 'grid'"
                  @click="showGridView"
                >
                  <LayoutGrid :size="18" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div v-if="showLibraryFilter" class="relative min-w-0 sm:hidden">
              <select
                :value="libraryId ?? ''"
                class="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
                @change="onLibraryFilterChange"
              >
                <option value="">{{ t('author.detail.books.allLibraries') }}</option>
                <option v-for="library in libraries" :key="library.id" :value="library.id">
                  {{ library.name }}
                </option>
              </select>
              <ChevronDown :size="14" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>

            <h2 class="hidden text-sm font-semibold text-foreground sm:block">
              {{ serialAuthor ? t('author.detail.books.headingSerials') : t('author.detail.books.heading') }}
            </h2>

            <div class="hidden flex-wrap items-center gap-2 sm:flex">
              <select
                v-model="sort"
                class="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors focus:border-primary/60 sm:w-auto"
              >
                <option value="addedAt">{{ t('author.detail.books.sort.recentlyAdded') }}</option>
                <option value="title">{{ t('author.detail.books.sort.title') }}</option>
                <option value="publishedYear">{{ t('author.detail.books.sort.publishedYear') }}</option>
              </select>

              <select
                v-model="order"
                class="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors focus:border-primary/60 sm:w-auto"
              >
                <option value="desc">{{ t('author.detail.books.descending') }}</option>
                <option value="asc">{{ t('author.detail.books.ascending') }}</option>
              </select>

              <select
                v-if="showLibraryFilter"
                :value="libraryId ?? ''"
                class="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors focus:border-primary/60 sm:w-auto"
                @change="onLibraryFilterChange"
              >
                <option value="">{{ t('author.detail.books.allLibraries') }}</option>
                <option v-for="library in libraries" :key="library.id" :value="library.id">{{ library.name }}</option>
              </select>

              <button
                data-testid="author-collapse-series-toggle"
                class="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                :class="
                  collapseSeries
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-input text-muted-foreground bg-background hover:text-foreground hover:bg-muted'
                "
                :aria-label="collapseToggleLabel"
                :aria-pressed="collapseSeries"
                :title="collapseToggleLabel"
                @click="handleToggleCollapse"
              >
                <Layers :size="14" />
              </button>

              <div class="flex items-center rounded-md border border-input bg-background">
                <button
                  class="flex h-8 w-8 items-center justify-center rounded-l-md transition-colors"
                  :class="
                    authorBooksViewMode === 'grid' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  "
                  :aria-label="t('author.detail.books.viewGrid')"
                  :aria-pressed="authorBooksViewMode === 'grid'"
                  @click="showGridView"
                >
                  <LayoutGrid :size="14" />
                </button>
                <button
                  class="flex h-8 w-8 items-center justify-center rounded-r-md transition-colors"
                  :class="
                    authorBooksViewMode === 'list' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  "
                  :aria-label="t('author.detail.books.viewList')"
                  :aria-pressed="authorBooksViewMode === 'list'"
                  @click="showListView"
                >
                  <List :size="14" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="booksError" class="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {{ booksError }}
          </div>

          <div v-if="!loadingBooks && books.length === 0" class="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p class="text-sm font-medium text-foreground">{{ t('author.detail.books.empty.title') }}</p>
            <p class="text-xs text-muted-foreground">{{ t('author.detail.books.empty.hint') }}</p>
          </div>

          <VirtualBookGrid
            v-if="authorBooksViewMode === 'grid' && books.length > 0"
            :books="books"
            :cover-size="authorBookCoverSize"
            :grid-gap="authorBookGridGap"
            @action="handleBookAction"
            @update:book="handleBookUpdate"
          />

          <div v-if="authorBooksViewMode === 'list' && books.length > 0" class="flex flex-col divide-y divide-border">
            <template v-for="book in books" :key="book.id">
              <AuthorSeriesRow
                v-if="book.collapsedSeries"
                :book="book"
                :serial="serialAuthor"
                :continuing="continuingSeriesId !== null && continuingSeriesId === book.seriesId"
                @open="openSeries"
                @continue="continueSeries"
              />
              <BookListRow v-else :book="book" @action="handleBookAction(book, $event)" />
            </template>
          </div>

          <div ref="sentinel" class="mt-4 flex h-8 items-center justify-center">
            <span v-if="loadingBooks" class="text-xs text-muted-foreground">{{ t('common.loading') }}</span>
            <span v-else-if="!hasMore && books.length > 0" class="text-xs text-muted-foreground">{{
              t('author.detail.books.allLoaded', { total: formatNumber(bookTotal) })
            }}</span>
          </div>
        </section>
      </template>
    </main>

    <AuthorConfirmDialog
      :open="confirmDeleteOpen"
      :title="t('author.detail.deleteDialog.title')"
      :description="t('author.detail.deleteDialog.description')"
      :confirm-label="t('common.delete')"
      :loading="deleting"
      destructive
      @confirm="runDelete"
      @cancel="confirmDeleteOpen = false"
    />

    <AuthorConfirmDialog
      :open="confirmMergeOpen"
      :title="mergeDialogTitle"
      :description="mergeDialogDescription"
      :confirm-label="t('author.detail.merge.confirmLabel')"
      :loading="merging"
      @confirm="runMerge"
      @cancel="confirmMergeOpen = false"
    />

    <DeleteBookDialog :open="deleteBookId !== null" :deleting="deletingBook" @confirm="confirmDelete" @cancel="cancelDelete" />

    <Sheet v-model:open="sortSheetOpen">
      <SheetContent side="bottom" class="rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{{ t('author.detail.books.sortSheetTitle') }}</SheetTitle>
          <SheetDescription class="sr-only">{{ t('author.detail.books.sortSheetTitle') }}</SheetDescription>
        </SheetHeader>
        <div class="flex flex-col px-2" role="radiogroup" :aria-label="t('author.detail.books.sortSheetTitle')">
          <button
            v-for="choice in SORT_CHOICES"
            :key="`${choice.sort}:${choice.order}`"
            type="button"
            role="radio"
            :aria-checked="isActiveSortChoice(choice)"
            class="flex min-h-12 items-center justify-between rounded-md px-3 text-base transition-colors active:bg-muted"
            :class="isActiveSortChoice(choice) ? 'font-medium text-foreground' : 'text-muted-foreground'"
            @click="applySortChoice(choice)"
          >
            {{ t(choice.label) }}
            <Check v-if="isActiveSortChoice(choice)" :size="18" class="text-primary" aria-hidden="true" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>
