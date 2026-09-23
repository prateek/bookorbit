<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

const emit = defineEmits<{ back: []; forward: [] }>()

const { t } = useI18n()

function handleBack() {
  emit('back')
}

function handleForward() {
  emit('forward')
}
</script>

<template>
  <!-- Touch screens swipe the shelf, so the arrows only show for a mouse or trackpad. -->
  <div class="flex shrink-0 items-center gap-1 pointer-coarse:hidden">
    <button
      type="button"
      class="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      :aria-label="t('book.detail.discover.scrollBack')"
      @click="handleBack"
    >
      <ChevronLeft :size="16" />
    </button>
    <button
      type="button"
      class="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      :aria-label="t('book.detail.discover.scrollForward')"
      @click="handleForward"
    >
      <ChevronRight :size="16" />
    </button>
  </div>
</template>
