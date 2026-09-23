<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
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

const breadcrumb = computed(() => {
  if (!match.value) return []
  const trail = [t('settings.nav.title'), t(match.value.group.labelKey)]
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
  <div ref="root" class="flex flex-col md:h-full md:overflow-hidden md:rounded-lg md:border md:border-border/70 md:bg-card/40 md:shadow-sm">
    <div class="pt-1 md:shrink-0 md:border-b md:border-border/70 md:bg-card/60 md:px-6 md:py-2.5" data-testid="settings-page-header">
      <RouterLink
        v-if="!isHome"
        :to="{ name: SETTINGS_HOME_ROUTE }"
        class="-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-md pr-3 text-[17px] text-primary outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        data-testid="settings-back"
      >
        <ChevronLeft :size="24" aria-hidden="true" />
        {{ t('settings.nav.title') }}
      </RouterLink>
      <h1 v-if="isHome" class="settings-title pb-4 pt-2 text-[28px] leading-tight md:hidden">{{ t('settings.nav.title') }}</h1>
      <div v-else class="flex min-h-9 items-center gap-4">
        <div class="flex min-w-0 flex-1 items-baseline gap-2">
          <!-- The trail gives way before the title does; phones use the back link instead. -->
          <nav v-if="breadcrumb.length" :aria-label="t('settings.nav.breadcrumbLabel')" class="min-w-0 shrink-[999] max-md:hidden">
            <ol class="flex min-w-0 items-baseline gap-2">
              <li
                v-for="(crumb, index) in breadcrumb"
                :key="crumb"
                class="flex min-w-0 items-baseline gap-2"
                :class="{ 'max-sm:hidden': index < breadcrumb.length - 1 }"
                data-testid="settings-breadcrumb-item"
              >
                <span class="truncate text-sm text-muted-foreground">{{ crumb }}</span>
                <ChevronRight :size="14" class="shrink-0 self-center text-muted-foreground rtl:rotate-180" aria-hidden="true" />
              </li>
            </ol>
          </nav>
          <h2 class="min-w-0 truncate font-serif text-lg font-semibold tracking-tight text-foreground" data-testid="settings-page-title">
            {{ pageTitle }}
          </h2>
        </div>
        <!-- Pages teleport their primary action here so it sits beside the title
             instead of being wedged into the page body. -->
        <div id="settings-header-actions" class="flex shrink-0 items-center gap-2" />
      </div>
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
