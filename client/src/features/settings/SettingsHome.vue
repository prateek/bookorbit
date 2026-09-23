<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChevronRight, Search, X } from '@lucide/vue'
import { useSettingsNavTree } from './composables/useSettingsNavTree'
import type { SettingsNavItem } from './lib/settings-nav'

const { t } = useI18n()

const { groups, isLibraryScanning, isBranchOpen, toggleBranch, query, results, isSearching } = useSettingsNavTree({ openNavigates: false })

function handleBranchClick(item: SettingsNavItem): void {
  toggleBranch(item)
}

function clearSearch(): void {
  query.value = ''
}

const listClass = 'overflow-hidden rounded-xl border border-border/70 bg-card divide-y divide-border/70'
const rowClass =
  'flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-[17px] leading-snug text-foreground outline-hidden transition-colors active:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
const iconTileClass = 'flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary'
</script>

<template>
  <nav class="flex flex-col gap-6 pb-4" :aria-label="t('settings.nav.ariaLabel')" data-testid="settings-home">
    <div class="relative">
      <Search :size="17" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        class="h-11 w-full min-w-0 rounded-xl border border-input bg-card pl-10 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
        :class="isSearching ? 'pr-11' : 'pr-3'"
        :placeholder="t('settings.nav.searchPlaceholder')"
        :aria-label="t('settings.nav.searchPlaceholder')"
        data-testid="settings-home-search"
      />
      <button
        v-if="isSearching"
        type="button"
        class="absolute right-0 top-0 flex size-11 items-center justify-center rounded-xl text-muted-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="t('settings.nav.clearSearch')"
        @click="clearSearch"
      >
        <X :size="17" aria-hidden="true" />
      </button>
    </div>

    <template v-if="isSearching">
      <p v-if="results.length === 0" class="px-4 py-6 text-center text-[15px] text-muted-foreground">
        {{ t('settings.nav.noResults', { query: query.trim() }) }}
      </p>
      <ul v-else :class="listClass">
        <li v-for="hit in results" :key="`${hit.group.id}-${hit.item.id}`">
          <RouterLink :to="{ name: hit.item.routeName }" :class="rowClass" data-testid="settings-home-result">
            <span :class="iconTileClass" aria-hidden="true"><component :is="hit.item.icon" :size="17" /></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ t(hit.item.labelKey) }}</span>
              <span class="block truncate text-[13px] text-muted-foreground">{{ t(hit.group.labelKey) }}</span>
            </span>
            <ChevronRight :size="18" class="shrink-0 text-muted-foreground" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </template>

    <template v-else>
      <section v-for="group in groups" :key="group.id">
        <h2 class="px-4 pb-1.5 text-[13px] font-medium uppercase tracking-wide text-muted-foreground" data-testid="settings-home-group">
          {{ t(group.labelKey) }}
        </h2>
        <ul :class="listClass">
          <li v-for="item in group.items" :key="item.id">
            <button
              v-if="item.children?.length"
              type="button"
              :class="rowClass"
              :aria-expanded="isBranchOpen(item)"
              data-testid="settings-home-item"
              @click="handleBranchClick(item)"
            >
              <span :class="iconTileClass" aria-hidden="true"><component :is="item.icon" :size="17" /></span>
              <span class="min-w-0 flex-1 truncate">{{ t(item.labelKey) }}</span>
              <ChevronRight
                :size="18"
                class="shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150"
                :class="isBranchOpen(item) ? 'rotate-90' : ''"
                aria-hidden="true"
              />
            </button>
            <RouterLink v-else :to="{ name: item.routeName }" :class="rowClass" data-testid="settings-home-item">
              <span :class="iconTileClass" aria-hidden="true"><component :is="item.icon" :size="17" /></span>
              <span class="min-w-0 flex-1 truncate">{{ t(item.labelKey) }}</span>
              <span
                v-if="item.status === 'libraryScan' && isLibraryScanning"
                role="status"
                class="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {{ t('settings.nav.status.scanning') }}
              </span>
              <ChevronRight :size="18" class="shrink-0 text-muted-foreground" aria-hidden="true" />
            </RouterLink>

            <ul v-if="isBranchOpen(item)" class="divide-y divide-border/70 border-t border-border/70 bg-muted/30">
              <li v-for="child in item.children" :key="child.id">
                <RouterLink :to="{ name: child.routeName }" :class="[rowClass, 'pl-14']" data-testid="settings-home-child">
                  <span class="min-w-0 flex-1 truncate">{{ t(child.labelKey) }}</span>
                  <ChevronRight :size="18" class="shrink-0 text-muted-foreground" aria-hidden="true" />
                </RouterLink>
              </li>
            </ul>
          </li>
        </ul>
      </section>
    </template>
  </nav>
</template>
