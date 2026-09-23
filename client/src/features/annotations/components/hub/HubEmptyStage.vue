<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { BookOpen, Highlighter, Smartphone } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

// Device sync only matters to someone reading on a Kobo or KOReader, which is rarely the person on a phone, so those cards wait for a wider screen.
const SOURCES = computed(() => [
  { key: 'web', icon: BookOpen, title: t('annotations.hub.empty.readHere'), body: t('annotations.hub.empty.readHereBody'), device: false },
  { key: 'kobo', icon: Smartphone, title: t('annotations.hub.empty.syncKobo'), body: t('annotations.hub.empty.syncKoboBody'), device: true },
  {
    key: 'koreader',
    icon: Smartphone,
    title: t('annotations.hub.empty.syncKoreader'),
    body: t('annotations.hub.empty.syncKoreaderBody'),
    device: true,
  },
])
</script>

<template>
  <section
    class="mx-auto flex w-full max-w-[58rem] flex-col items-center gap-3.5 rounded-xl border border-border bg-card px-5 py-8 text-center sm:px-6"
  >
    <span class="grid size-13 place-items-center rounded-full border border-border bg-muted text-muted-foreground">
      <Highlighter :size="22" />
    </span>
    <div>
      <h2 class="text-[17px] font-bold text-foreground sm:text-[15px]">{{ t('annotations.hub.empty.noAnnotations') }}</h2>
      <p class="mx-auto mt-1.5 max-w-[48ch] text-[15px] leading-relaxed text-muted-foreground sm:text-[13px]">
        {{ t('annotations.hub.empty.noAnnotationsBody') }}
      </p>
    </div>
    <ul class="mt-0.5 grid w-full gap-3 text-left sm:grid-cols-3">
      <li
        v-for="source in SOURCES"
        :key="source.key"
        :data-source="source.key"
        :class="['rounded-xl border border-border bg-muted/40 px-3.5 py-3 sm:px-3 sm:py-2.5', source.device && 'max-sm:hidden']"
      >
        <span class="flex items-center gap-1.5" :style="{ color: `var(--pill-${source.key})` }">
          <component :is="source.icon" :size="15" />
          <b class="text-[15px] font-bold text-foreground sm:text-[13px]">{{ source.title }}</b>
        </span>
        <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-[13px]">{{ source.body }}</p>
      </li>
    </ul>
    <Button as-child class="mt-0.5 min-h-11 gap-1.5 px-5 pointer-fine:sm:min-h-9">
      <RouterLink :to="{ name: 'dashboard' }">
        <BookOpen :size="15" />
        {{ t('annotations.hub.empty.continueReading') }}
      </RouterLink>
    </Button>
  </section>
</template>
