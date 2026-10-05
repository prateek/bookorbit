<script setup lang="ts">
import { isIosHomeScreenApp } from './home-screen'

defineProps<{ color: string | null }>()

const standalone = isIosHomeScreenApp()
</script>

<template>
  <!-- Previously installed iOS apps can report a zero safe inset; WebKit needs an edge taller than 10px to sample. -->
  <div
    v-if="standalone && color"
    aria-hidden="true"
    class="pointer-events-none fixed inset-x-0 top-0 z-40 h-[max(12px,env(safe-area-inset-top,0px))]"
    :style="{ backgroundColor: color }"
  />
</template>
