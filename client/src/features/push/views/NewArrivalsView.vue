<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { BookOpen } from '@lucide/vue'
import { useNewArrivals } from '../composables/useNewArrivals'

const { t } = useI18n()
const route = useRoute()
const { page, loading, error, hasPrevious, load, next, previous, retry, readerUrl } = useNewArrivals(String(route.params.token))
const seriesUrl = computed(() => (page.value?.seriesId ? `/series/${page.value.seriesId}` : null))

onMounted(() => load())
</script>

<template>
  <main class="mx-auto w-full max-w-3xl space-y-5 p-4 md:p-8" :aria-busy="loading">
    <header class="space-y-2">
      <h1 class="text-2xl font-semibold">{{ t('newArrivals.title') }}</h1>
      <p v-if="page" class="text-muted-foreground">{{ page.message }}</p>
      <RouterLink v-if="seriesUrl" :to="seriesUrl" class="inline-block text-primary underline">{{ t('newArrivals.viewSeries') }}</RouterLink>
    </header>
    <p v-if="error" role="alert">{{ t(`newArrivals.${error}`) }}</p>
    <button v-if="error === 'failed'" type="button" class="rounded-md border border-border px-4 py-2" @click="retry">
      {{ t('newArrivals.retry') }}
    </button>
    <p v-if="loading" role="status">{{ t('newArrivals.loading') }}</p>
    <template v-else-if="page && !error">
      <p v-if="!page.items.length" class="text-muted-foreground">{{ t('newArrivals.empty') }}</p>
      <ul class="divide-y divide-border rounded-lg border border-border bg-card">
        <li v-for="book in page.items" :key="book.id" class="flex items-center gap-3 p-4">
          <BookOpen class="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <RouterLink :to="readerUrl(book)" class="block break-words font-medium text-foreground">{{
              book.title || t('newArrivals.untitled')
            }}</RouterLink>
            <p v-if="book.seriesName" class="text-sm text-muted-foreground">
              {{ book.seriesName }}<span v-if="book.seriesIndex"> · {{ book.seriesIndex }}</span>
            </p>
            <RouterLink :to="`/book/${book.id}`" class="text-sm text-primary underline">{{ t('newArrivals.details') }}</RouterLink>
          </div>
          <RouterLink :to="readerUrl(book)" class="shrink-0 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">{{
            t('newArrivals.open')
          }}</RouterLink>
        </li>
      </ul>
      <nav class="flex justify-between gap-3" :aria-label="t('newArrivals.pages')">
        <button type="button" class="rounded-md border border-border px-4 py-2 disabled:opacity-40" :disabled="!hasPrevious" @click="previous">
          {{ t('newArrivals.previous') }}
        </button>
        <button type="button" class="rounded-md border border-border px-4 py-2 disabled:opacity-40" :disabled="!page.hasMore" @click="next">
          {{ t('newArrivals.next') }}
        </button>
      </nav>
    </template>
  </main>
</template>
