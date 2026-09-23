<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import AppSidebar from '@/components/AppSidebar.vue'
import AppHeader from '@/components/AppHeader.vue'
import AppBottomNav from '@/components/sidebar/AppBottomNav.vue'
import { useAppResumeWatcher } from '@/components/sidebar/useAppResume'
import BookMetadataFetchWidget from '@/features/book-metadata-fetch/components/BookMetadataFetchWidget.vue'
import {
  isReturningToHistoryEntry,
  readScrollPosition,
  restoreScrollPosition,
  scrollEntryKey,
  writeScrollPosition,
} from '@/features/book/composables/useScrollRestoreOnActivate'
import { useThemeStore, BACKGROUND_OPTIONS } from '@/stores/theme'

const route = useRoute()
const themeStore = useThemeStore()

const backgroundClass = computed(() => BACKGROUND_OPTIONS.find((b) => b.id === themeStore.background)?.cssClass ?? '')

const BOOK_ROUTE_NAMES = new Set(['book-detail'])

/**
 * The request drawer is a child route of the list, so the list has to stay mounted while the URL
 * moves under it. Keying on the path would remount it, re-fetch the rows and run the page
 * transition every time a drawer opened.
 */
const REQUEST_ROUTE_NAMES = new Set(['book-requests', 'book-request-detail', 'book-request-releases'])

// Grid views are kept alive so scroll position and virtual list state survive
// round-trips to the book detail / metadata editor page.
const GRID_VIEW_NAMES = [
  'HomeView',
  'SmartScopeView',
  'CollectionView',
  'AuthorsView',
  'SeriesView',
  'SeriesDetailView',
  'AuthorDetailView',
  'LibrariesView',
  'PodcastLibrariesView',
  'PodcastCollectionView',
  'PodcastScopeView',
  'SmartScopesView',
  'CollectionsView',
]

const viewKey = computed(() => {
  const name = String(route.name)
  if (BOOK_ROUTE_NAMES.has(name)) return name
  if (REQUEST_ROUTE_NAMES.has(name)) return 'requests'
  if (name.startsWith('settings-')) return 'settings'
  if (name.startsWith('tools-')) return 'tools'
  return route.path
})

const appHeader = ref<InstanceType<typeof AppHeader> | null>(null)

function handleBottomNavSearch() {
  appHeader.value?.openMobileSearch()
}

useAppResumeWatcher()

/*
 * Views that scroll the shell container (the dashboard, detail pages) are re-created on every
 * visit, and the window never scrolls, so the router's scrollBehavior cannot help. The shell
 * position is saved per history entry and put back when the user returns to that entry.
 */
const shellScroll = ref<HTMLElement | null>(null)
let shellKey = scrollEntryKey('shell', route.path)
let shellPaused = false
let shellFrame = 0
let cancelShellRestore: (() => void) | null = null

function handleShellScroll() {
  if (shellPaused || shellFrame) return
  shellFrame = requestAnimationFrame(() => {
    shellFrame = 0
    const el = shellScroll.value
    if (el && !shellPaused) writeScrollPosition(shellKey, el.scrollTop)
  })
}

function stopShellRestore() {
  cancelShellRestore?.()
  cancelShellRestore = null
}

watch(viewKey, () => {
  // The leaving page clamps the scroll offset as it is removed; that must not overwrite its entry.
  shellPaused = true
  stopShellRestore()
})

watch(
  () => route.fullPath,
  () => {
    if (!shellPaused) shellKey = scrollEntryKey('shell', route.path)
  },
  { flush: 'post' },
)

function handlePageAfterEnter() {
  const el = shellScroll.value
  shellKey = scrollEntryKey('shell', route.path)
  shellPaused = false
  if (!el) return
  const target = isReturningToHistoryEntry() ? readScrollPosition(shellKey) : 0
  if (target === null) return
  shellPaused = true
  cancelShellRestore = restoreScrollPosition(el, target, () => {
    shellPaused = false
    cancelShellRestore = null
  })
}

// Coming back from the reader re-creates the whole shell, and the first page renders without a
// transition, so after-enter never fires for it.
onMounted(handlePageAfterEnter)

onBeforeUnmount(() => {
  stopShellRestore()
  if (shellFrame) cancelAnimationFrame(shellFrame)
})
</script>

<template>
  <SidebarProvider class="app-shell glow-wrapper min-h-svh" :class="backgroundClass">
    <AppSidebar />
    <SidebarInset class="app-shell-inset flex flex-col h-svh overflow-hidden relative bg-transparent md:pb-(--shell-gap)">
      <!-- 1. Global App Header: Fixed at the top, independent of views -->
      <AppHeader ref="appHeader" />

      <!--
        2. Independent View Area: Everything below the header scrolls here. The bottom padding is the
        floating podcast player's measured height, so scrolled-to-bottom content clears it without a
        document-level scrollbar. On phones the tab bar below is a flex sibling, so it never covers content.
      -->
      <div
        ref="shellScroll"
        class="app-shell-scroll px-(--shell-content-gutter) pt-2 md:pt-(--shell-gap) pb-[var(--podcast-mini-player-clearance,0px)] flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth bg-transparent"
        @scroll.passive="handleShellScroll"
      >
        <router-view v-slot="{ Component }">
          <Transition name="page" mode="out-in" @after-enter="handlePageAfterEnter">
            <KeepAlive :include="GRID_VIEW_NAMES" :max="10">
              <component :is="Component" :key="viewKey" />
            </KeepAlive>
          </Transition>
        </router-view>
      </div>

      <!-- 3. Phone tab bar: lives inside the shell, so the reader and the auth pages never show it. -->
      <AppBottomNav @search="handleBottomNavSearch" />
    </SidebarInset>
    <BookMetadataFetchWidget />
  </SidebarProvider>
</template>
