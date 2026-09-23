<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import SettingsPageHeader from '@/features/settings/SettingsPageHeader.vue'
import { findSettingsNavItem } from '@/features/settings/lib/settings-nav'
import { SETTINGS_HOME_ROUTE } from '@/features/settings/lib/settings-home'

const { t } = useI18n()
const route = useRoute()

const root = ref<HTMLElement | null>(null)
const contentScroll = ref<HTMLElement | null>(null)

const maxWidth = computed(() => (route.meta.maxWidth as string | undefined) ?? 'max-w-3xl')
const isHome = computed(() => route.name === SETTINGS_HOME_ROUTE)
const match = computed(() => findSettingsNavItem(typeof route.name === 'string' ? route.name : ''))
const pageTitle = computed(() => (match.value ? t(match.value.item.labelKey) : t('settings.nav.title')))
const pageDescription = computed(() => (match.value?.item.descriptionKey ? t(match.value.item.descriptionKey) : ''))

const breadcrumb = computed(() => {
  if (!match.value) return []
  const trail = [t(match.value.group.labelKey)]
  if (match.value.parent) trail.push(t(match.value.parent.labelKey))
  return trail
})

watch(
  () => route.name,
  () => {
    if (contentScroll.value) contentScroll.value.scrollTop = 0
    // On phones the page scrolls with the app shell rather than an inner container.
    const shellScroll = root.value?.closest('.app-shell-scroll')
    if (shellScroll) shellScroll.scrollTop = 0
  },
)
</script>

<template>
  <div
    ref="root"
    class="flex flex-col md:mt-2 md:h-[calc(100%-0.5rem)] md:overflow-hidden md:rounded-lg md:border md:border-border/70 md:bg-card/40 md:shadow-sm"
  >
    <div class="pt-1 md:shrink-0 md:border-b md:border-border/70 md:bg-card/60 md:px-6 md:py-3" data-testid="settings-page-header">
      <RouterLink
        v-if="!isHome"
        :to="{ name: SETTINGS_HOME_ROUTE }"
        class="-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-md pr-3 text-[17px] text-primary outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        data-testid="settings-back"
      >
        <ChevronLeft :size="24" aria-hidden="true" />
        {{ t('settings.nav.title') }}
      </RouterLink>
      <div class="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
        <span>{{ t('settings.nav.title') }}</span>
        <template v-for="crumb in breadcrumb" :key="crumb">
          <ChevronRight :size="13" class="opacity-60" aria-hidden="true" />
          <span class="truncate">{{ crumb }}</span>
        </template>
      </div>
      <h1 v-if="isHome" class="settings-title pb-4 pt-2 text-[28px] leading-tight md:hidden">{{ t('settings.nav.title') }}</h1>
      <SettingsPageHeader v-else-if="match" class="mb-0! mt-1 md:mt-2" :title="pageTitle" :subtitle="pageDescription">
        <!-- Pages teleport their primary action here so it sits beside the title
             instead of being wedged into the page body. -->
        <div id="settings-header-actions" class="contents" />
      </SettingsPageHeader>
    </div>

    <div ref="contentScroll" class="md:min-h-0 md:flex-1 md:overflow-x-hidden md:overflow-y-auto">
      <div data-testid="settings-page-content" class="pb-6 pt-4 md:px-6 md:pt-5" :class="maxWidth">
        <router-view v-slot="{ Component, route: childRoute }">
          <div :key="childRoute.path">
            <component :is="Component" />
          </div>
        </router-view>
      </div>
    </div>
  </div>
</template>
