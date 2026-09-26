<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  CircleHelp,
  Clock3,
  Columns3,
  EyeOff,
  Headphones,
  ListChecks,
  Maximize,
  Minimize,
  Percent,
  Pin,
  PinOff,
  Search,
  Settings,
} from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import type { EpubFooterRightItem } from '@bookorbit/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import ReaderSettingsSheet from '@/features/reader/shared/components/ReaderSettingsSheet.vue'
import { useFullscreen } from '../../shared/composables/useFullscreen'
import { readerChromeThemeStyle, useReaderPageContext } from '../composables/readerPageContext'

const { t } = useI18n()

const props = defineProps<{
  chapterTitle: string
  seriesTitle?: string | null
  isBookmarked: boolean
  settingsOpen: boolean
  footerRight: EpubFooterRightItem
  peekMode?: boolean
  isTtsActive?: boolean
  isTtsAvailable?: boolean
  isMediaOverlay?: boolean
  isPinned?: boolean
  showTapZones?: boolean
}>()

const emit = defineEmits<{
  back: []
  toggleSidebar: []
  toggleSearch: []
  toggleBookmark: []
  'update:settingsOpen': [open: boolean]
  toggleFullscreen: []
  toggleHelp: []
  cycleFooterMode: []
  startReading: []
  startTts: []
  togglePin: []
  toggleTapZones: []
}>()

const { isFullscreen, isFullscreenSupported } = useFullscreen()

const pageContext = useReaderPageContext()
const chromeStyle = computed(() => readerChromeThemeStyle(pageContext?.mode.value))

// A phone gets the compact bar in either orientation: turned sideways it is wide enough for the
// desktop controls but still has a phone's height and no keyboard to use them with. The settings
// surface follows suit: a bottom sheet where the thumb is, an anchored popover elsewhere.
const isCompact = useMediaQuery('(max-width: 639px), (pointer: coarse) and (max-height: 499px)')

const ttsTooltip = computed(() => {
  if (props.isTtsActive) return props.isMediaOverlay ? t('reader.header.narrationPlaying') : t('reader.header.ttsPlaying')
  return props.isMediaOverlay ? t('reader.header.listenWithNarrationShort') : t('reader.header.listen')
})

// One width class at a time: Tailwind emits max-w-full after max-w-[40vw], so both would lose the cap.
const titleWidthClass = computed(() => (isCompact.value ? 'max-w-full' : 'max-w-[40vw]'))

const pinMenuLabel = computed(() => (props.isPinned ? t('reader.header.unpinMenu') : t('reader.header.pinMenu')))

function onSettingsOpenChange(open: boolean) {
  emit('update:settingsOpen', open)
}

/** Mirrors PopoverTrigger on the wide path, so the icon means the same thing in both containers. */
function toggleSettings() {
  emit('update:settingsOpen', !props.settingsOpen)
}

const footerModeIcon = computed(() => {
  if (props.footerRight === 'time-left') return Clock3
  if (props.footerRight === 'percent') return Percent
  if (props.footerRight === 'unread') return ListChecks
  return EyeOff
})

const footerModeTooltip = computed(() => t(`reader.header.footerMode.${props.footerRight}`))
</script>

<template>
  <header
    data-reader-chrome
    class="reader-bar fixed top-0 left-0 right-0 z-50 flex h-[calc(2.75rem+env(safe-area-inset-top))] items-center gap-1 border-b border-border bg-background/95 px-1 pt-[env(safe-area-inset-top)] text-foreground backdrop-blur-md sm:px-3"
    :style="chromeStyle"
  >
    <!-- Left button group -->
    <div class="flex shrink-0 items-center gap-0 sm:gap-1">
      <Tooltip>
        <TooltipTrigger as-child>
          <button class="viewer-btn" :aria-label="t('reader.header.goBack')" @click="emit('back')">
            <ArrowLeft :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('reader.header.goBack') }}</TooltipContent>
      </Tooltip>

      <div v-if="!isCompact" class="viewer-sep" />

      <Tooltip>
        <TooltipTrigger as-child>
          <button class="viewer-btn" :aria-label="t('reader.header.tableOfContents')" @click="emit('toggleSidebar')">
            <BookOpen :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('reader.header.tableOfContents') }}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as-child>
          <button
            class="viewer-btn"
            :class="isBookmarked ? '!text-primary' : ''"
            :aria-label="t('reader.header.toggleBookmark')"
            @click="emit('toggleBookmark')"
          >
            <BookmarkCheck v-if="isBookmarked" :size="18" />
            <Bookmark v-else :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('reader.header.toggleBookmark') }}</TooltipContent>
      </Tooltip>
    </div>

    <!-- Title: fills the gap between the button groups on phones, centered over the bar on wider screens -->
    <div
      class="flex min-w-0 flex-1 flex-col items-center justify-center px-1 leading-tight"
      :class="isCompact ? '' : 'pointer-events-none absolute inset-x-0 bottom-0 h-11 px-0'"
    >
      <p v-if="seriesTitle" class="truncate text-center text-[11px] text-muted-foreground" :class="titleWidthClass">
        {{ seriesTitle }}
      </p>
      <p class="truncate text-center text-sm font-medium text-foreground" :class="titleWidthClass">{{ chapterTitle }}</p>
    </div>

    <!-- Right button group -->
    <div class="ml-auto flex shrink-0 items-center gap-0 sm:gap-1">
      <div v-if="props.peekMode" class="flex h-7 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 text-primary">
        <span class="hidden text-[11px] font-medium sm:inline">{{ t('reader.peek.badge') }}</span>
        <button
          class="relative h-5 rounded-sm bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground transition-colors before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:bg-primary/90 sm:h-6 sm:px-2 sm:text-[11px]"
          @click="emit('startReading')"
        >
          {{ t('reader.peek.startReading') }}
        </button>
      </div>

      <Tooltip v-if="props.isTtsAvailable !== false">
        <TooltipTrigger as-child>
          <button
            class="viewer-btn"
            :class="props.isTtsActive ? '!text-primary' : ''"
            :aria-label="props.isMediaOverlay ? t('reader.header.listenWithNarration') : t('reader.header.listenWithTts')"
            @click="emit('startTts')"
          >
            <Headphones :size="18" :class="{ 'animate-pulse': props.isTtsActive }" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ ttsTooltip }}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as-child>
          <button class="viewer-btn" :aria-label="t('common.search')" @click="emit('toggleSearch')">
            <Search :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('common.search') }}</TooltipContent>
      </Tooltip>

      <Tooltip v-if="!isCompact">
        <TooltipTrigger as-child>
          <button class="viewer-btn" :aria-label="t('reader.header.cycleFooterMode')" @click="emit('cycleFooterMode')">
            <component :is="footerModeIcon" :size="16" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ footerModeTooltip }}</TooltipContent>
      </Tooltip>

      <Tooltip v-if="!isCompact">
        <TooltipTrigger as-child>
          <button class="viewer-btn" :aria-label="t('reader.shortcuts.title')" @click="emit('toggleHelp')">
            <CircleHelp :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('reader.header.keyboardShortcutsHint') }}</TooltipContent>
      </Tooltip>

      <Tooltip v-if="isFullscreenSupported">
        <TooltipTrigger as-child>
          <button
            class="viewer-btn"
            :aria-label="isFullscreen ? t('reader.header.exitFullscreen') : t('reader.header.enterFullscreen')"
            @click="emit('toggleFullscreen')"
          >
            <Minimize v-if="isFullscreen" :size="18" />
            <Maximize v-else :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ isFullscreen ? t('reader.header.exitFullscreen') : t('reader.header.enterFullscreen') }}</TooltipContent>
      </Tooltip>

      <Tooltip v-if="!isCompact">
        <TooltipTrigger as-child>
          <button
            class="viewer-btn"
            :class="props.showTapZones ? '!bg-muted !text-primary' : ''"
            :aria-label="t('reader.header.toggleTapZones')"
            @click="emit('toggleTapZones')"
          >
            <Columns3 :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('reader.header.showTapZones') }}</TooltipContent>
      </Tooltip>

      <Tooltip v-if="!isCompact">
        <TooltipTrigger as-child>
          <button class="viewer-btn" :class="props.isPinned ? '!bg-muted !text-primary' : ''" :aria-label="pinMenuLabel" @click="emit('togglePin')">
            <PinOff v-if="props.isPinned" :size="18" />
            <Pin v-else :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ pinMenuLabel }}</TooltipContent>
      </Tooltip>

      <template v-if="isCompact">
        <button
          class="viewer-btn"
          :class="props.settingsOpen ? '!bg-muted !text-foreground' : ''"
          :title="t('reader.settings.title')"
          :aria-label="t('reader.settings.ariaLabel')"
          @click="toggleSettings"
        >
          <Settings :size="18" />
        </button>
        <ReaderSettingsSheet :open="props.settingsOpen" @update:open="onSettingsOpenChange">
          <slot name="settingsPanel" />
        </ReaderSettingsSheet>
      </template>

      <Popover v-else :open="props.settingsOpen" @update:open="onSettingsOpenChange">
        <PopoverTrigger as-child>
          <button
            class="viewer-btn"
            :class="props.settingsOpen ? '!bg-muted !text-foreground' : ''"
            :title="t('reader.settings.title')"
            :aria-label="t('reader.settings.ariaLabel')"
          >
            <Settings :size="18" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          :side-offset="10"
          class="flex max-h-[min(80vh,40rem)] w-[21rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border-border bg-card p-0 shadow-2xl"
        >
          <slot name="settingsPanel" />
        </PopoverContent>
      </Popover>
    </div>
  </header>
</template>

<style scoped>
/* .viewer-btn is a 32px square; on a touch screen every bar control needs a 44px target. */
@media (pointer: coarse) {
  .reader-bar :deep(.viewer-btn) {
    width: 2.75rem;
    height: 2.75rem;
  }
}
</style>
