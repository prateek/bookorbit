<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, type RouteLocationRaw } from 'vue-router'
import { Aperture, House, Library, Menu, Search } from '@lucide/vue'
import { useSidebar } from '@/components/ui/sidebar'
import { scrollAppShellToTop } from './scrollAppShellToTop'

type BottomNavTab =
  | {
      id: string
      kind: 'link'
      label: string
      icon: Component
      to: RouteLocationRaw
      rootRoute: string
      isActive: boolean
    }
  | { id: 'search' | 'more'; kind: 'action'; label: string; icon: Component; isActive: boolean }

const emit = defineEmits<{ search: [] }>()

const { t } = useI18n()
const route = useRoute()
const { openMobile, setOpenMobile } = useSidebar()

const SERIES_ROUTES = new Set(['series', 'series-detail'])
const SCOPE_ROUTES = new Set(['smart-scopes', 'smartScope'])

const tabs = computed<BottomNavTab[]>(() => {
  const name = typeof route.name === 'string' ? route.name : ''
  const drawerOpen = openMobile.value
  return [
    {
      id: 'home',
      kind: 'link',
      label: t('components.bottomNav.home'),
      icon: House,
      to: { name: 'dashboard' },
      rootRoute: 'dashboard',
      isActive: !drawerOpen && name === 'dashboard',
    },
    {
      id: 'series',
      kind: 'link',
      label: t('components.bottomNav.series'),
      icon: Library,
      to: { name: 'series' },
      rootRoute: 'series',
      isActive: !drawerOpen && SERIES_ROUTES.has(name),
    },
    { id: 'search', kind: 'action', label: t('components.bottomNav.search'), icon: Search, isActive: false },
    {
      id: 'scopes',
      kind: 'link',
      label: t('components.bottomNav.scopes'),
      icon: Aperture,
      to: { name: 'smart-scopes' },
      rootRoute: 'smart-scopes',
      isActive: !drawerOpen && SCOPE_ROUTES.has(name),
    },
    { id: 'more', kind: 'action', label: t('components.bottomNav.more'), icon: Menu, isActive: drawerOpen },
  ]
})

function handleAction(id: 'search' | 'more') {
  if (id === 'more') {
    setOpenMobile(!openMobile.value)
    return
  }
  setOpenMobile(false)
  emit('search')
}

type LinkTab = Extract<BottomNavTab, { kind: 'link' }>

// iOS convention: tapping the tab you are already on (at its root page) scrolls back to the top.
function handleLinkClick(tab: LinkTab) {
  const onTabRoot = tab.isActive && route.name === tab.rootRoute
  setOpenMobile(false)
  if (onTabRoot) scrollAppShellToTop()
}

const itemClass =
  'flex h-full min-h-11 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-none outline-hidden transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
</script>

<template>
  <nav
    data-app-bottom-nav
    :aria-label="t('components.bottomNav.label')"
    class="relative z-20 flex-none border-t border-(--shell-border) bg-(--shell-surface) pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
  >
    <ul class="grid h-14 grid-cols-5">
      <li v-for="tab in tabs" :key="tab.id" class="min-w-0">
        <RouterLink
          v-if="tab.kind === 'link'"
          :to="tab.to"
          :class="[itemClass, tab.isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground']"
          :aria-current="tab.isActive ? 'page' : undefined"
          :data-testid="`bottom-nav-${tab.id}`"
          @click="handleLinkClick(tab)"
        >
          <component :is="tab.icon" :size="22" :stroke-width="tab.isActive ? 2.25 : 1.75" aria-hidden="true" />
          <span class="max-w-full truncate px-1">{{ tab.label }}</span>
        </RouterLink>
        <button
          v-else
          type="button"
          :class="[itemClass, tab.isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground']"
          :aria-expanded="tab.id === 'more' ? tab.isActive : undefined"
          :data-testid="`bottom-nav-${tab.id}`"
          @click="handleAction(tab.id)"
        >
          <component :is="tab.icon" :size="22" :stroke-width="tab.isActive ? 2.25 : 1.75" aria-hidden="true" />
          <span class="max-w-full truncate px-1">{{ tab.label }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>
