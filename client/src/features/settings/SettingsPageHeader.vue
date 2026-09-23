<script setup lang="ts">
defineProps<{ title: string; subtitle: string }>()
</script>

<template>
  <div class="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 md:flex-nowrap">
    <div class="min-w-0 max-md:basis-full">
      <h2 class="settings-title max-md:text-[28px] max-md:leading-tight">{{ title }}</h2>
      <p class="settings-subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" class="flex shrink-0 items-center gap-2 has-[>.contents:empty]:hidden">
      <slot />
    </div>
  </div>
</template>
