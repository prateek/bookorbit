<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    icon: Component
    title: string
    description?: string
    /** Lets the enclosing card shrink to a single row on phones and sink below charts that have data. */
    collapsible?: boolean
  }>(),
  { collapsible: true },
)
</script>

<template>
  <div
    :data-chart-empty-state="collapsible ? '' : undefined"
    :class="[
      'text-muted-foreground flex h-full flex-col items-center justify-center gap-3 text-center animate-fade-up',
      collapsible && 'max-md:flex-row max-md:justify-start max-md:text-left',
    ]"
    style="animation-delay: 100ms"
  >
    <component :is="icon" :class="['size-9 shrink-0 opacity-20', collapsible && 'max-md:hidden']" />
    <div :class="['flex max-w-[280px] flex-col items-center gap-1', collapsible && 'max-md:max-w-none max-md:items-start']">
      <p class="text-sm font-medium">{{ title }}</p>
      <p v-if="description" class="text-xs opacity-70 max-md:text-[13px]">{{ description }}</p>
    </div>
  </div>
</template>
