<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  Search,
  Palette,
  Upload,
  X,
  KeyRound,
  Settings,
  LogOut,
  User,
  BarChart3,
  Trophy,
  MoreVertical,
  BadgeQuestionMark,
  Headphones,
  ExternalLink,
  Sparkles,
  Languages,
  Info,
  Library,
} from '@lucide/vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import AccentPicker from '@/components/AccentPicker.vue'
import LanguagePicker from '@/components/LanguagePicker.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import RadiusPicker from '@/components/RadiusPicker.vue'
import BackgroundPicker from '@/components/BackgroundPicker.vue'
import ThemePicker from '@/components/ThemePicker.vue'
import SurfaceBrightnessPicker from '@/components/SurfaceBrightnessPicker.vue'
import SurfacePicker from '@/components/SurfacePicker.vue'
import { useGlobalSearch, type GlobalSearchResult, type GlobalSearchSeriesResult } from '@/features/book/composables/useGlobalSearch'
import BookCoverImage from '@/features/book/components/BookCoverImage.vue'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useChangePasswordDialog } from '@/composables/useChangePasswordDialog'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import BookUploadModal from '@/features/library/components/BookUploadModal.vue'
import { useLibraryUploadEvents } from '@/features/library/composables/useLibraryUploadEvents'
import NotificationSheet from '@/features/notifications/components/NotificationSheet.vue'
import { useNotifications } from '@/features/notifications/composables/useNotifications'
import { useWhatsNew } from '@/features/whats-new/composables/useWhatsNew'
import UserAvatar from '@/components/UserAvatar.vue'
import { DEFAULT_FORMAT_PRIORITY, LOCALE_LABELS, Permission, type Locale } from '@bookorbit/types'
import { formatNumber } from '@/i18n/formatters'
import { useThemeStore } from '@/stores/theme'
import { useLocaleStore } from '@/stores/locale'
import { getFormatColor } from '@/features/book/lib/format-colors'
import { useLegalNotices } from '@/components/legal/useLegalNotices'
import { hasReadAlong, isReadAlongFormat, READ_ALONG_FORMAT_COLOR, READ_ALONG_FORMAT_TITLE } from '@/features/book/lib/file-capabilities'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { user, logout } = useAuth()
const { open: openChangePassword } = useChangePasswordDialog()
const { hasPermission, isDemoRestrictedAccount } = usePermissions()
const { onLibraryUploadCompleted } = useLibraryUploadEvents()
const { subscribe: subscribeNotifications } = useNotifications()
const { hasUnseen: hasUnseenWhatsNew } = useWhatsNew()
const themeStore = useThemeStore()
const localeStore = useLocaleStore()
const { openLegalNotices } = useLegalNotices()
const currentLanguageLabel = computed(() => LOCALE_LABELS[localeStore.locale])
const documentationUrl = 'https://bookorbit.app/what-is-bookorbit'

const iconRadiusClass = computed(() => (themeStore.radius === 'sharp' ? 'rounded-none' : 'rounded-full'))

/**
 * Every header control shares one ghost treatment; nothing in here outranks anything else.
 * Interactive chrome sits at full foreground, matching the sidebar nav rows: muted is for
 * secondary text, not for controls.
 */
const controlClass = computed(() => [
  'touch-target h-8 w-8 max-md:size-9 border border-(--shell-accent-line) text-foreground transition-colors duration-150 hover:bg-(--shell-accent-wash)',
  iconRadiusClass.value,
])

/** Same ghost geometry, plus the tinted active state the two destinations need. */
function destinationClass(isActive: boolean) {
  return [
    'touch-target h-8 w-8 border transition-colors duration-150',
    isActive ? 'border-primary bg-(--shell-accent-tint) text-primary' : 'border-(--shell-accent-line) text-foreground hover:bg-(--shell-accent-wash)',
    iconRadiusClass.value,
  ]
}

const isStatisticsActive = computed(() => route.name === 'statistics')
const isAchievementsActive = computed(() => route.name === 'achievements')
const achievementsEnabled = computed(() => user.value?.settings?.achievementPreferences?.enabled !== false)

function navigateToStatistics() {
  router.push({ name: 'statistics', query: { tab: 'library' } })
}

function navigateToAchievements() {
  router.push({ name: 'achievements' })
}

const canChangePassword = computed(
  () => !isDemoRestrictedAccount.value && user.value?.provisioningMethod !== 'oidc' && user.value?.provisioningMethod !== 'shared',
)
const canAccessNotifications = computed(() => hasPermission(Permission.NotificationAccess) && !isDemoRestrictedAccount.value)
const GLOBAL_SEARCH_ROW_HEIGHT = 84
const GLOBAL_SEARCH_SERIES_ROW_HEIGHT = 60
const GLOBAL_SEARCH_SECTION_LABEL_HEIGHT = 28
const GLOBAL_SEARCH_OVERSCAN = 4
const GLOBAL_SEARCH_VIEWPORT_HEIGHT = 512

function navigateToAccount() {
  router.push({ name: 'settings-account' })
}

function navigateToSettings() {
  router.push({ name: 'settings-libraries' })
}

function navigateToSettingsHome() {
  router.push({ name: 'settings-home' })
}

const appearanceSheetOpen = ref(false)
const languageSheetOpen = ref(false)
const languagePopoverOpen = ref(false)

async function selectLanguage(locale: Locale) {
  languageSheetOpen.value = false
  languagePopoverOpen.value = false

  try {
    await localeStore.setLocale(locale)
  } catch {
    toast.error(t('settings.appearance.language.loadError'))
  }
}

function openLanguageSheet() {
  languageSheetOpen.value = true
}

function openAppearanceSheet() {
  appearanceSheetOpen.value = true
}

function navigateToWhatsNew() {
  router.push({ name: 'whats-new' })
}

const uploadOpen = ref(false)

function openUpload() {
  uploadOpen.value = true
}

function closeUpload() {
  uploadOpen.value = false
}

function handleChangePassword() {
  openChangePassword()
}

const searchFocused = ref(false)
const mobileSearchOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const searchDropdownRef = ref<HTMLElement | null>(null)
const searchDropdownScrollTop = ref(0)
const selectedIndex = ref(-1)

const globalSearchQuery = ref('')
const {
  results: globalResults,
  total: globalSearchTotal,
  series: globalSeries,
  seriesTotal: globalSeriesTotal,
  loading: globalSearchLoading,
  loadingMore: globalSearchLoadingMore,
  settled: globalSearchSettled,
  hasMore: globalSearchHasMore,
  loadMore: loadMoreGlobalSearch,
  clear: clearGlobalSearch,
} = useGlobalSearch(globalSearchQuery)

const hasAnyResult = computed(() => globalResults.value.length > 0 || globalSeries.value.length > 0)

const showDropdown = computed(
  () =>
    (searchFocused.value || mobileSearchOpen.value) &&
    globalSearchQuery.value.trim().length >= 2 &&
    (hasAnyResult.value || globalSearchLoading.value || globalSearchSettled.value),
)

/** Series rows sit above the virtual book list, so book offsets start below them. */
const seriesBlockHeight = computed(() => {
  const count = globalSeries.value.length
  if (count === 0) return 0
  const booksLabel = globalResults.value.length > 0 ? GLOBAL_SEARCH_SECTION_LABEL_HEIGHT : 0
  return GLOBAL_SEARCH_SECTION_LABEL_HEIGHT + count * GLOBAL_SEARCH_SERIES_ROW_HEIGHT + booksLabel
})

const selectableCount = computed(() => globalSeries.value.length + globalResults.value.length)
const globalSeriesTotalLabel = computed(() => formatNumber(globalSeriesTotal.value))
const globalBooksTotalLabel = computed(() => formatNumber(globalSearchTotal.value))

function seriesMeta(series: GlobalSearchSeriesResult): string {
  const count = t('components.appHeader.bookCount', { count: series.bookCount })
  return series.authors.length ? `${count} · ${series.authors.join(', ')}` : count
}

const searchWrapperClass = computed(() =>
  mobileSearchOpen.value ? 'flex min-w-0 flex-1 md:mx-4 md:max-w-2xl' : 'mx-4 hidden w-full max-w-2xl md:flex',
)

const globalSearchLoadMoreLabel = computed(() =>
  globalSearchLoadingMore.value
    ? t('components.appHeader.loadingMore')
    : t('components.appHeader.loadMore', { loaded: globalResults.value.length, total: globalSearchTotal.value }),
)
const globalSearchAllLoadedLabel = computed(() => t('components.appHeader.allMatchesShown', { count: globalSearchTotal.value }))
const globalSearchVirtualHeightStyle = computed(() => ({
  height: `${globalResults.value.length * GLOBAL_SEARCH_ROW_HEIGHT}px`,
}))
const globalSearchVirtualRows = computed(() => {
  const bookScrollTop = Math.max(0, searchDropdownScrollTop.value - seriesBlockHeight.value)
  const start = Math.max(0, Math.floor(bookScrollTop / GLOBAL_SEARCH_ROW_HEIGHT) - GLOBAL_SEARCH_OVERSCAN)
  const visibleCount = Math.ceil(GLOBAL_SEARCH_VIEWPORT_HEIGHT / GLOBAL_SEARCH_ROW_HEIGHT) + GLOBAL_SEARCH_OVERSCAN * 2
  const end = Math.min(globalResults.value.length, start + visibleCount)

  return globalResults.value.slice(start, end).map((result, offset) => {
    const index = start + offset
    return {
      result,
      index,
      selectionIndex: globalSeries.value.length + index,
      style: {
        height: `${GLOBAL_SEARCH_ROW_HEIGHT}px`,
        transform: `translateY(${index * GLOBAL_SEARCH_ROW_HEIGHT}px)`,
      },
    }
  })
})

/** Return pressed before the results arrived: open the first one as soon as they land. */
let pendingEnter = false

function onSearchBlur() {
  searchFocused.value = false
  selectedIndex.value = -1
  // The desktop dropdown closes on blur; the mobile search mode stays up with the keyboard dismissed.
  if (!mobileSearchOpen.value) pendingEnter = false
}

watch(globalSearchQuery, () => {
  pendingEnter = false
  selectedIndex.value = -1
  searchDropdownScrollTop.value = 0
  void nextTick(() => {
    if (searchDropdownRef.value) searchDropdownRef.value.scrollTop = 0
  })
})

watch(showDropdown, (open) => {
  if (!open) selectedIndex.value = -1
})

watch(mobileSearchOpen, (open) => {
  if (open) nextTick(() => searchInput.value?.focus())
})

function selectionBounds(index: number): { top: number; height: number } {
  const seriesCount = globalSeries.value.length
  if (index < seriesCount) {
    return { top: GLOBAL_SEARCH_SECTION_LABEL_HEIGHT + index * GLOBAL_SEARCH_SERIES_ROW_HEIGHT, height: GLOBAL_SEARCH_SERIES_ROW_HEIGHT }
  }
  return { top: seriesBlockHeight.value + (index - seriesCount) * GLOBAL_SEARCH_ROW_HEIGHT, height: GLOBAL_SEARCH_ROW_HEIGHT }
}

watch(selectedIndex, (index) => {
  if (index < 0) return
  const el = searchDropdownRef.value
  if (!el) return

  const { top, height } = selectionBounds(index)
  const bottom = top + height
  if (top < el.scrollTop) {
    el.scrollTop = top
  } else if (bottom > el.scrollTop + el.clientHeight) {
    el.scrollTop = bottom - el.clientHeight
  }
  searchDropdownScrollTop.value = el.scrollTop
})

function clearSearch() {
  pendingEnter = false
  globalSearchQuery.value = ''
  clearGlobalSearch()
}

function openMobileSearch() {
  mobileSearchOpen.value = true
}

function closeMobileSearch() {
  mobileSearchOpen.value = false
  clearSearch()
}

function handleSearchFocus() {
  searchFocused.value = true
}

function navigateToResult(result: GlobalSearchResult) {
  clearSearch()
  mobileSearchOpen.value = false
  router.push({ name: 'book-detail', params: { bookId: result.id } })
}

function navigateToSeries(series: GlobalSearchSeriesResult) {
  clearSearch()
  mobileSearchOpen.value = false
  router.push({ name: 'series-detail', params: { seriesId: series.id } })
}

/** Series come first in the dropdown, so selection indexes run through them before the books. */
function openSelection(index: number): boolean {
  const seriesCount = globalSeries.value.length
  const series = index < seriesCount ? globalSeries.value[index] : undefined
  if (series) {
    navigateToSeries(series)
    return true
  }
  const result = globalResults.value[index - seriesCount]
  if (result) {
    navigateToResult(result)
    return true
  }
  return false
}

watch(globalSearchLoading, (loading) => {
  if (loading || !pendingEnter) return
  pendingEnter = false
  openSelection(0)
})

function handleSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    clearSearch()
    return
  }
  if (e.key === 'Enter') {
    if (e.isComposing) return
    e.preventDefault()
    if (openSelection(Math.max(selectedIndex.value, 0))) return
    pendingEnter = globalSearchLoading.value
    return
  }
  if (!showDropdown.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, selectableCount.value - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, -1)
  }
}

function handleSearchDropdownScroll(event: Event) {
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  searchDropdownScrollTop.value = el.scrollTop
  if (!globalSearchHasMore.value || globalSearchLoading.value || globalSearchLoadingMore.value) return

  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
  if (remaining <= 96) void loadMoreGlobalSearch()
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchInput.value?.focus()
  }
}

defineExpose({ openMobileSearch })

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  if (canAccessNotifications.value) {
    subscribeNotifications()
  }
})

const stopLibraryUploadListener = onLibraryUploadCompleted((event) => {
  if (event.uploadedCount === 0 && event.failedCount === 0) return

  const uploadedLabel = t('components.appHeader.bookCount', { count: event.uploadedCount })
  const failedLabel = t('components.appHeader.fileCount', { count: event.failedCount })

  if (event.failedCount === 0) {
    toast.success(t('components.appHeader.uploadedToast', { uploaded: uploadedLabel }))
    return
  }
  if (event.uploadedCount === 0) {
    toast.error(t('components.appHeader.uploadFailedToast', { failed: failedLabel }))
    return
  }

  toast.warning(t('components.appHeader.uploadPartialToast', { uploaded: uploadedLabel, failed: failedLabel }))
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  stopLibraryUploadListener()
})

function highlightSegments(text: string | null, query: string) {
  if (!text || !query.trim()) return [{ text: text ?? '', match: false }]
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  const lower = query.trim().toLowerCase()
  return parts.map((part) => ({ text: part, match: part.toLowerCase() === lower }))
}

function sortFormats(formats: string[]): string[] {
  return [...formats].sort((a, b) => {
    const aIndex = (DEFAULT_FORMAT_PRIORITY as readonly string[]).indexOf(a.toLowerCase())
    const bIndex = (DEFAULT_FORMAT_PRIORITY as readonly string[]).indexOf(b.toLowerCase())

    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
}

function resultFormats(result: GlobalSearchResult): string[] {
  const formats = new Set<string>()
  for (const file of result.files) {
    const fmt = file.format?.toLowerCase()
    if (fmt) formats.add(fmt)
  }
  return sortFormats([...formats])
}

function formatHasReadAlong(fmt: string, result: GlobalSearchResult): boolean {
  return isReadAlongFormat(
    fmt,
    result.files.some((file) => hasReadAlong(file)),
  )
}

function formatBadgeStyle(fmt: string, result?: GlobalSearchResult) {
  const color = result && formatHasReadAlong(fmt, result) ? READ_ALONG_FORMAT_COLOR : getFormatColor(fmt)
  return {
    color,
    backgroundColor: `color-mix(in oklch, ${color} 10%, transparent)`,
    borderColor: `color-mix(in oklch, ${color} 20%, transparent)`,
  }
}
</script>

<template>
  <header
    class="relative z-30 flex h-12 flex-none shrink-0 items-center gap-2 border-(--shell-border) bg-(--shell-surface) px-3 backdrop-blur-xl backdrop-saturate-150 max-md:border-b md:mx-(--shell-gap) md:mt-(--shell-gap) md:rounded-(--shell-radius) md:border md:shadow-lg"
  >
    <Button
      v-if="mobileSearchOpen"
      variant="ghost"
      size="icon"
      class="touch-target size-9 shrink-0"
      :aria-label="t('components.appHeader.closeSearch')"
      @click="closeMobileSearch"
    >
      <ArrowLeft :size="18" aria-hidden="true" />
    </Button>
    <template v-else>
      <SidebarTrigger :class="['-ml-1 text-foreground hover:bg-(--shell-accent-wash) max-md:size-9', iconRadiusClass]" />
      <Separator orientation="vertical" class="mx-1 h-4" />
    </template>

    <!-- Global search: one input serves the desktop bar and the mobile search mode. -->
    <div data-tour="global-search" :class="['relative items-center', searchWrapperClass]">
      <Search class="pointer-events-none absolute left-3 text-muted-foreground" :size="14" aria-hidden="true" />
      <input
        ref="searchInput"
        v-model="globalSearchQuery"
        type="search"
        enterkeyhint="search"
        autocapitalize="none"
        autocorrect="off"
        autocomplete="off"
        spellcheck="false"
        :aria-label="t('components.appHeader.searchAllBooks')"
        :placeholder="t('components.appHeader.searchAllBooks')"
        :class="[
          'h-11 w-full border border-(--shell-accent-line) bg-(--shell-accent-wash) pl-9 pr-11 text-base text-foreground transition-colors duration-150 md:h-8 md:pr-8 md:text-[14px]',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring [&::-webkit-search-cancel-button]:appearance-none',
          iconRadiusClass,
        ]"
        @focus="handleSearchFocus"
        @blur="onSearchBlur"
        @keydown="handleSearchKeydown"
      />
      <div class="absolute inset-y-0 right-1.5 flex items-center gap-1.5 md:right-2.5">
        <button
          v-if="globalSearchQuery"
          type="button"
          class="touch-target flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground md:size-5"
          :aria-label="t('components.appHeader.clearSearch')"
          @click="clearSearch"
        >
          <X :size="14" aria-hidden="true" />
        </button>
        <kbd
          v-else
          class="hidden h-5 select-none items-center gap-1 rounded border border-(--shell-accent-line) px-1.5 font-mono text-[11px] font-semibold text-muted-foreground lg:inline-flex"
        >
          <span class="leading-none">⌘</span>
          <span class="leading-none">K</span>
        </kbd>
      </div>

      <Transition name="search-drop">
        <div
          v-if="showDropdown"
          ref="searchDropdownRef"
          data-testid="global-search-dropdown"
          @mousedown.prevent
          @scroll.passive="handleSearchDropdownScroll"
          class="absolute top-full left-0 right-0 z-50 mt-1 max-h-[min(32rem,calc(100dvh-5rem))] overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border border-border bg-background shadow-lg max-md:max-h-[calc(100dvh-4.5rem-var(--app-bottom-nav-height,0px)-env(safe-area-inset-top,0px))]"
        >
          <div v-if="globalSearchLoading && !hasAnyResult" class="p-3 text-[13px] text-muted-foreground text-center">
            {{ t('components.appHeader.searching') }}
          </div>
          <div v-else-if="globalSearchSettled && !globalSearchLoading && !hasAnyResult" class="p-3 text-[13px] text-muted-foreground text-center">
            {{ t('components.appHeader.noResults') }}
          </div>

          <template v-if="globalSeries.length > 0">
            <p
              class="flex items-center justify-between px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
              :style="{ height: `${GLOBAL_SEARCH_SECTION_LABEL_HEIGHT}px` }"
            >
              <span>{{ t('components.appHeader.seriesSection') }}</span>
              <span class="tabular-nums normal-case tracking-normal">{{ globalSeriesTotalLabel }}</span>
            </p>
            <button
              v-for="(series, seriesIndex) in globalSeries"
              :key="`series-${series.id}`"
              type="button"
              data-testid="global-search-series"
              :style="{ height: `${GLOBAL_SEARCH_SERIES_ROW_HEIGHT}px` }"
              :class="[
                'flex w-full items-center gap-3 border-b border-border px-3 text-left transition-colors',
                selectedIndex === seriesIndex ? 'bg-accent' : 'hover:bg-accent/60',
              ]"
              @click="navigateToSeries(series)"
            >
              <BookCoverImage
                v-if="series.coverBookIds[0]"
                :book-id="series.coverBookIds[0]"
                type="thumbnail"
                class="h-11 w-8 shrink-0 rounded bg-muted object-cover"
                :alt="''"
              />
              <span v-else class="flex h-11 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                <Library :size="16" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[14px] font-medium text-foreground">
                  <template v-for="seg in highlightSegments(series.name, globalSearchQuery)" :key="seg.text + seg.match">
                    <span v-if="seg.match" class="bg-(--shell-accent-tint) text-foreground font-semibold rounded-sm px-0.5">{{ seg.text }}</span>
                    <span v-else>{{ seg.text }}</span>
                  </template>
                </span>
                <span class="mt-0.5 block truncate text-[13px] text-muted-foreground">{{ seriesMeta(series) }}</span>
              </span>
            </button>
            <p
              v-if="globalResults.length > 0"
              class="flex items-center justify-between px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
              :style="{ height: `${GLOBAL_SEARCH_SECTION_LABEL_HEIGHT}px` }"
            >
              <span>{{ t('components.appHeader.booksSection') }}</span>
              <span class="tabular-nums normal-case tracking-normal">{{ globalBooksTotalLabel }}</span>
            </p>
          </template>

          <div v-if="globalResults.length > 0" class="relative" :style="globalSearchVirtualHeightStyle">
            <button
              v-for="row in globalSearchVirtualRows"
              :key="row.result.id"
              type="button"
              :style="row.style"
              @click="navigateToResult(row.result)"
              :class="[
                'absolute left-0 right-0 flex items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors',
                selectedIndex === row.selectionIndex ? 'bg-accent' : 'hover:bg-accent/60',
              ]"
            >
              <BookCoverImage
                :book-id="row.result.id"
                type="thumbnail"
                :version="row.result.updatedAt"
                class="h-16 w-12 object-cover rounded shrink-0 bg-muted"
                :alt="row.result.title ?? ''"
              />
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium text-foreground truncate">
                  <template v-for="seg in highlightSegments(row.result.title, globalSearchQuery)" :key="seg.text + seg.match">
                    <span v-if="seg.match" class="bg-(--shell-accent-tint) text-foreground font-semibold rounded-sm px-0.5">{{ seg.text }}</span>
                    <span v-else>{{ seg.text }}</span>
                  </template>
                </p>
                <p v-if="row.result.authors.length" class="text-[13px] text-muted-foreground truncate mt-0.5">
                  <template v-for="seg in highlightSegments(row.result.authors.join(', '), globalSearchQuery)" :key="seg.text + seg.match">
                    <span v-if="seg.match" class="bg-(--shell-accent-tint) text-foreground font-semibold rounded-sm px-0.5">{{ seg.text }}</span>
                    <span v-else>{{ seg.text }}</span>
                  </template>
                </p>
                <p v-if="row.result.seriesName" class="text-[13px] text-muted-foreground truncate mt-0.5 italic">
                  <template v-for="seg in highlightSegments(row.result.seriesName, globalSearchQuery)" :key="seg.text + seg.match">
                    <span v-if="seg.match" class="bg-(--shell-accent-tint) text-foreground font-semibold rounded-sm px-0.5 not-italic">{{
                      seg.text
                    }}</span>
                    <span v-else>{{ seg.text }}</span>
                  </template>
                </p>
              </div>
              <div v-if="resultFormats(row.result).length" class="flex shrink-0 gap-1">
                <span
                  v-for="fmt in resultFormats(row.result)"
                  :key="fmt"
                  class="inline-flex items-center gap-0.5 text-[11px] font-semibold px-1 py-0.5 rounded border uppercase"
                  :style="formatBadgeStyle(fmt, row.result)"
                  :title="formatHasReadAlong(fmt, row.result) ? READ_ALONG_FORMAT_TITLE : undefined"
                >
                  {{ fmt }}
                  <Headphones v-if="formatHasReadAlong(fmt, row.result)" class="size-2.5 shrink-0" :stroke-width="2.5" aria-hidden="true" />
                </span>
              </div>
            </button>
          </div>
          <div v-if="globalResults.length > 0" class="border-t border-border px-3 py-2 text-center text-[13px] text-muted-foreground">
            <button
              v-if="globalSearchHasMore"
              type="button"
              class="min-h-11 font-medium text-primary transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 md:min-h-0"
              :disabled="globalSearchLoadingMore"
              @click="loadMoreGlobalSearch"
            >
              {{ globalSearchLoadMoreLabel }}
            </button>
            <span v-else>{{ globalSearchAllLoadedLabel }}</span>
          </div>
        </div>
      </Transition>
    </div>

    <template v-if="!mobileSearchOpen">
      <!-- Right -->
      <div class="ml-auto flex items-center gap-2">
        <!-- Mobile: search icon -->
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" :class="['md:hidden', controlClass]" :aria-label="t('common.search')" @click="openMobileSearch">
              <Search :size="16" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t('common.search') }}</TooltipContent>
        </Tooltip>

        <!-- Mobile: Notifications bell -->
        <div class="md:hidden">
          <NotificationSheet v-if="canAccessNotifications" :icon-radius-class="iconRadiusClass" />
        </div>

        <!-- Mobile: Kebab Menu -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" :class="['md:hidden', controlClass]" :aria-label="t('components.appHeader.moreActions')">
              <MoreVertical :size="16" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem @click="navigateToStatistics">
              <BarChart3 :size="15" class="mr-2 text-muted-foreground" />
              {{ t('components.appHeader.statistics') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="achievementsEnabled" @click="navigateToAchievements">
              <Trophy :size="15" class="mr-2 text-muted-foreground" />
              {{ t('components.appHeader.achievements') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="hasPermission('library_upload')" @click="openUpload">
              <Upload :size="15" class="mr-2 text-muted-foreground" />
              {{ t('components.appHeader.uploadBooks') }}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem @click="openAppearanceSheet">
              <Palette :size="15" class="mr-2 text-muted-foreground" />
              {{ t('components.appHeader.appearance') }}
            </DropdownMenuItem>

            <DropdownMenuItem @click="openLanguageSheet">
              <Languages :size="15" class="mr-2 text-muted-foreground" />
              {{ t('settings.appearance.language.label') }}
              <span class="ms-auto ps-3 text-xs text-muted-foreground">{{ currentLanguageLabel }}</span>
            </DropdownMenuItem>

            <DropdownMenuItem @click="navigateToSettingsHome">
              <Settings :size="15" class="mr-2 text-muted-foreground" />
              {{ t('components.appHeader.settings') }}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem @click="navigateToWhatsNew">
              <Sparkles :size="15" class="mr-2 text-muted-foreground" />
              {{ t('components.appHeader.whatsNew') }}
              <span v-if="hasUnseenWhatsNew" class="ml-auto h-1.5 w-1.5 rounded-full bg-primary" :aria-label="t('components.appHeader.new')" />
            </DropdownMenuItem>
            <DropdownMenuItem as-child>
              <a :href="documentationUrl" target="_blank" rel="noopener noreferrer">
                <BadgeQuestionMark :size="15" class="mr-2 text-muted-foreground" />
                {{ t('components.appHeader.documentation') }}
                <ExternalLink :size="12" class="ml-auto text-muted-foreground" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem @click="openLegalNotices">
              <Info :size="15" class="mr-2 text-muted-foreground" />
              {{ t('components.legalNotices.about') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" class="hidden h-4 md:block" />

        <!-- Group 1: Content (Notifications, Statistics, Achievements, Upload) -->
        <div class="hidden md:flex items-center gap-1.5">
          <NotificationSheet v-if="canAccessNotifications" :icon-radius-class="iconRadiusClass" />

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                data-tour="statistics-btn"
                variant="ghost"
                size="icon"
                :class="destinationClass(isStatisticsActive)"
                :aria-label="t('components.appHeader.statistics')"
                @click="navigateToStatistics"
              >
                <BarChart3 :size="15" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ t('components.appHeader.statistics') }}</TooltipContent>
          </Tooltip>

          <Tooltip v-if="achievementsEnabled">
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                :class="destinationClass(isAchievementsActive)"
                :aria-label="t('components.appHeader.achievements')"
                @click="navigateToAchievements"
              >
                <Trophy :size="15" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ t('components.appHeader.achievements') }}</TooltipContent>
          </Tooltip>

          <Tooltip v-if="hasPermission('library_upload')">
            <TooltipTrigger as-child>
              <Button
                data-tour="upload-button"
                variant="ghost"
                size="icon"
                :class="controlClass"
                :aria-label="t('components.appHeader.uploadBooks')"
                @click="openUpload"
              >
                <Upload :size="15" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ t('components.appHeader.uploadBooks') }}</TooltipContent>
          </Tooltip>
        </div>

        <!-- Group 2: Preferences (Help, Appearance, Language, Settings) -->
        <Separator orientation="vertical" class="hidden h-4 md:block" />
        <div class="hidden md:flex items-center gap-1.5">
          <Tooltip>
            <DropdownMenu>
              <TooltipTrigger as-child>
                <DropdownMenuTrigger as-child>
                  <Button
                    data-tour="documentation-link"
                    variant="ghost"
                    size="icon"
                    :class="['relative', controlClass]"
                    :aria-label="t('components.appHeader.help')"
                  >
                    <BadgeQuestionMark :size="15" />
                    <span
                      v-if="hasUnseenWhatsNew"
                      class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
                      :aria-label="t('components.appHeader.newReleaseNotes')"
                    />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <DropdownMenuContent align="end" class="w-48">
                <DropdownMenuItem as-child>
                  <a :href="documentationUrl" target="_blank" rel="noopener noreferrer">
                    <BadgeQuestionMark :size="14" class="mr-2 text-muted-foreground" />
                    {{ t('components.appHeader.documentation') }}
                    <ExternalLink :size="12" class="ml-auto text-muted-foreground" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem @click="navigateToWhatsNew">
                  <Sparkles :size="14" class="mr-2 text-muted-foreground" />
                  {{ t('components.appHeader.whatsNew') }}
                  <span v-if="hasUnseenWhatsNew" class="ml-auto h-1.5 w-1.5 rounded-full bg-primary" :aria-label="t('components.appHeader.new')" />
                </DropdownMenuItem>
                <DropdownMenuItem @click="openLegalNotices">
                  <Info :size="14" class="mr-2 text-muted-foreground" />
                  {{ t('components.legalNotices.about') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent>{{ t('components.appHeader.help') }}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <Popover>
              <TooltipTrigger as-child>
                <PopoverTrigger as-child>
                  <Button
                    data-tour="appearance-picker"
                    variant="ghost"
                    size="icon"
                    :class="controlClass"
                    :aria-label="t('components.appHeader.appearance')"
                  >
                    <Palette :size="15" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <PopoverContent class="w-72 p-4" align="end">
                <div class="space-y-4">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">{{ t('components.appHeader.appearance') }}</p>
                  <div class="space-y-1.5">
                    <span class="text-[13px] text-muted-foreground">{{ t('components.appHeader.theme') }}</span>
                    <ThemePicker />
                  </div>
                  <div class="space-y-1.5">
                    <span class="text-[13px] text-muted-foreground">{{ t('components.appHeader.accent') }}</span>
                    <AccentPicker />
                  </div>
                  <div class="space-y-1.5">
                    <span class="text-[13px] text-muted-foreground">{{ t('components.appHeader.radius') }}</span>
                    <RadiusPicker />
                  </div>
                  <div class="space-y-1.5">
                    <span class="text-[13px] text-muted-foreground">{{ t('components.appHeader.surfaceOpacity') }}</span>
                    <SurfacePicker />
                  </div>
                  <div v-if="themeStore.resolvedTheme === 'dark'" class="space-y-1.5">
                    <span class="text-[13px] text-muted-foreground">{{ t('settings.appearance.theme.surfaceBrightness.label') }}</span>
                    <SurfaceBrightnessPicker />
                  </div>
                  <div class="space-y-1.5">
                    <span class="text-[13px] text-muted-foreground">{{ t('components.appHeader.background') }}</span>
                    <BackgroundPicker />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <TooltipContent>{{ t('components.appHeader.appearance') }}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <Popover v-model:open="languagePopoverOpen">
              <TooltipTrigger as-child>
                <PopoverTrigger as-child>
                  <Button
                    data-testid="language-control"
                    variant="ghost"
                    size="icon"
                    :class="controlClass"
                    :aria-label="t('settings.appearance.language.label')"
                  >
                    <Languages :size="15" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <PopoverContent align="end" class="w-80 p-1">
                <LanguagePicker :autofocus="languagePopoverOpen" class="max-h-[min(26rem,calc(100dvh-8rem))]" @select="selectLanguage" />
              </PopoverContent>
            </Popover>
            <TooltipContent>{{ t('settings.appearance.language.label') }}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                data-tour="settings-nav"
                variant="ghost"
                size="icon"
                :class="controlClass"
                :aria-label="t('components.appHeader.settings')"
                @click="navigateToSettings"
              >
                <Settings :size="15" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ t('components.appHeader.settings') }}</TooltipContent>
          </Tooltip>
        </div>

        <!-- Group 3: Identity (Avatar) -->
        <Separator orientation="vertical" class="hidden h-4 md:block" />
        <DropdownMenu v-if="user">
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              :aria-label="t('components.appHeader.accountMenu')"
              :class="[
                'touch-target flex h-8 w-8 shrink-0 items-center justify-center border border-(--shell-accent-line) bg-(--shell-accent-tint) transition-colors duration-150 hover:bg-(--shell-accent-wash) focus:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:size-9',
                iconRadiusClass,
              ]"
            >
              <span :class="['h-full w-full overflow-hidden', iconRadiusClass]">
                <UserAvatar :name="user.name" :avatar-url="user.avatarUrl ?? null" size-class="h-full w-full" />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-48">
            <DropdownMenuLabel class="font-normal">
              <div class="flex flex-col gap-0.5">
                <span class="text-[13px] font-medium text-foreground">{{ user.name }}</span>
                <span class="text-[11px] text-muted-foreground">{{ user.username }}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="navigateToAccount">
              <User :size="13" class="mr-2 text-muted-foreground" />
              {{ t('components.appHeader.account') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator v-if="canChangePassword" />
            <DropdownMenuItem v-if="canChangePassword" @click="handleChangePassword">
              <KeyRound :size="13" class="mr-2 text-muted-foreground" />
              {{ t('components.appHeader.changePassword') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="logout" class="text-destructive focus:text-destructive">
              <LogOut :size="13" class="mr-2" />
              {{ t('components.appHeader.signOut') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </template>
  </header>

  <BookUploadModal v-if="uploadOpen" @close="closeUpload" @uploaded="closeUpload" />

  <Sheet v-model:open="appearanceSheetOpen">
    <SheetContent side="bottom" class="h-[85dvh] rounded-t-xl p-0">
      <SheetHeader class="shrink-0 border-b border-border px-4 py-3 text-start">
        <SheetTitle class="text-base">{{ t('components.appHeader.appearance') }}</SheetTitle>
        <SheetDescription class="sr-only">{{ t('components.appHeader.appearanceDescription') }}</SheetDescription>
      </SheetHeader>
      <div class="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <section class="space-y-2 rounded-lg border border-border bg-card p-3">
          <h3 class="text-xs font-medium text-foreground">{{ t('components.appHeader.theme') }}</h3>
          <ThemePicker touch />
        </section>

        <section class="space-y-2 rounded-lg border border-border bg-card p-3">
          <h3 class="text-xs font-medium text-foreground">{{ t('components.appHeader.accent') }}</h3>
          <AccentPicker touch />
        </section>

        <section class="space-y-2 rounded-lg border border-border bg-card p-3">
          <h3 class="text-xs font-medium text-foreground">{{ t('components.appHeader.radius') }}</h3>
          <RadiusPicker touch />
        </section>

        <section class="space-y-3 rounded-lg border border-border bg-card p-3">
          <div class="space-y-2">
            <h3 class="text-xs font-medium text-foreground">{{ t('components.appHeader.surfaceOpacity') }}</h3>
            <SurfacePicker />
          </div>
          <div v-if="themeStore.resolvedTheme === 'dark'" class="space-y-2 border-t border-border pt-3">
            <h3 class="text-xs font-medium text-foreground">{{ t('settings.appearance.theme.surfaceBrightness.label') }}</h3>
            <SurfaceBrightnessPicker />
          </div>
        </section>

        <section class="space-y-2 rounded-lg border border-border bg-card p-3">
          <h3 class="text-xs font-medium text-foreground">{{ t('components.appHeader.background') }}</h3>
          <BackgroundPicker touch />
        </section>
      </div>
    </SheetContent>
  </Sheet>

  <Sheet v-model:open="languageSheetOpen">
    <SheetContent side="bottom" class="h-[85dvh] rounded-t-xl px-2 pb-2">
      <SheetHeader class="pb-1">
        <SheetTitle>{{ t('settings.appearance.language.label') }}</SheetTitle>
        <SheetDescription class="sr-only">{{ t('settings.appearance.language.description') }}</SheetDescription>
      </SheetHeader>
      <LanguagePicker :autofocus="false" class="min-h-0 flex-1" @select="selectLanguage" />
    </SheetContent>
  </Sheet>
</template>
