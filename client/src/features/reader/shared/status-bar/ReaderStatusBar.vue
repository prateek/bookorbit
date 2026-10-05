<script setup lang="ts">
import { isIosHomeScreenApp } from './home-screen'

defineProps<{ color: string | null }>()

const standalone = isIosHomeScreenApp()
</script>

<template>
  <!-- A fixed edge also tints native chrome in iOS apps installed before black-translucent was enabled. -->
  <div
    v-if="standalone && color"
    aria-hidden="true"
    class="pointer-events-none fixed inset-x-0 top-0 z-40 h-[var(--reader-top-inset)]"
    :style="{ backgroundColor: color }"
  />
</template>
