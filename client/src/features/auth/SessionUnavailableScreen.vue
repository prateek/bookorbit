<script setup lang="ts">
import { RefreshCw, WifiOff } from '@lucide/vue'

defineProps<{
  title: string
  message: string
  retryLabel: string
  retrying: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

function handleRetry() {
  emit('retry')
}
</script>

<template>
  <main class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground" role="alert">
    <WifiOff :size="32" class="text-muted-foreground" aria-hidden="true" />
    <h1 class="text-xl font-semibold">{{ title }}</h1>
    <p class="max-w-sm text-base text-muted-foreground md:text-sm">{{ message }}</p>
    <button
      type="button"
      :disabled="retrying"
      class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:text-sm"
      @click="handleRetry"
    >
      <RefreshCw :size="16" :class="retrying ? 'animate-spin' : ''" aria-hidden="true" />
      {{ retryLabel }}
    </button>
  </main>
</template>
