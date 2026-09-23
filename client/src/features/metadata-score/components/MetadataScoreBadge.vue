<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  score: number | null
}>()

const emit = defineEmits<{
  click: []
}>()

const { t } = useI18n()

function handleClick() {
  emit('click')
}

const label = computed(() => {
  if (props.score === null) return null
  return t('metadataScore.badgeLabel', { score: props.score })
})

// Outlined with a band-colored dot so it cannot be mistaken for reading progress or status.
const dotClass = computed(() => {
  const s = props.score
  if (s === null) return 'bg-muted-foreground'
  if (s >= 90) return 'bg-success'
  if (s >= 70) return 'bg-success/60'
  if (s >= 50) return 'bg-warning'
  return 'bg-destructive'
})
</script>

<template>
  <button
    v-if="label !== null"
    type="button"
    data-test="metadata-score-badge"
    class="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground cursor-pointer transition-colors duration-200 hover:bg-muted hover:text-foreground"
    :aria-label="t('metadataScore.badgeAria', { score: score ?? 0 })"
    @click="handleClick"
  >
    <span class="size-1.5 shrink-0 rounded-full" :class="dotClass" aria-hidden="true" />
    {{ label }}
  </button>
</template>
