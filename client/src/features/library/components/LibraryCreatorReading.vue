<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'

const { t } = useI18n()

const props = defineProps<{
  readingThreshold: number
  markAsFinishedPercentComplete: number
  countSeriesAsOneBook: boolean
}>()

const emit = defineEmits<{
  'update:readingThreshold': [value: number]
  'update:markAsFinishedPercentComplete': [value: number]
  'update:countSeriesAsOneBook': [value: boolean]
}>()

function handleCountSeriesAsOneBookToggle() {
  emit('update:countSeriesAsOneBook', !props.countSeriesAsOneBook)
}

function onReadingThresholdInput(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (!isNaN(val)) emit('update:readingThreshold', val)
}

function onFinishPercentInput(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value, 10)
  if (!isNaN(val)) emit('update:markAsFinishedPercentComplete', val)
}
</script>

<template>
  <div class="px-6 py-6 space-y-6">
    <!-- Reading start -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label for="reading-threshold" class="text-[11px] font-semibold uppercase tracking-widest text-foreground">
          {{ t('library.creator.reading.readingStart.title') }}
        </label>
        <output for="reading-threshold" class="text-sm font-medium text-foreground tabular-nums">{{ readingThreshold }}%</output>
      </div>
      <p id="reading-threshold-help" class="text-xs text-muted-foreground mb-3">
        A book is marked as "reading" once this percentage of progress is reached.
      </p>
      <input
        id="reading-threshold"
        type="range"
        :value="readingThreshold"
        min="0.05"
        max="5"
        step="0.05"
        class="w-full accent-primary"
        aria-describedby="reading-threshold-help"
        @input="onReadingThresholdInput"
      />
      <div class="flex justify-between text-xs text-muted-foreground mt-1">
        <span>0.05%</span>
        <span>5%</span>
      </div>
    </div>

    <!-- Mark as finished -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label for="finished-threshold" class="text-[11px] font-semibold uppercase tracking-widest text-foreground">
          {{ t('library.creator.reading.markAsFinished.title') }}
        </label>
        <output for="finished-threshold" class="text-sm font-medium text-foreground tabular-nums"> {{ markAsFinishedPercentComplete }}% </output>
      </div>
      <p id="finished-threshold-help" class="text-xs text-muted-foreground mb-3">
        A book is automatically marked as "read" when this percentage of progress is reached.
      </p>
      <input
        id="finished-threshold"
        type="range"
        :value="markAsFinishedPercentComplete"
        min="90"
        max="100"
        step="1"
        class="w-full accent-primary"
        aria-describedby="finished-threshold-help"
        @input="onFinishPercentInput"
      />
      <div class="flex justify-between text-xs text-muted-foreground mt-1">
        <span>90%</span>
        <span>100%</span>
      </div>
    </div>

    <div class="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <p class="text-sm font-medium text-foreground">{{ t('library.creator.reading.countSeriesAsOneBook.title') }}</p>
        <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
          {{ t('library.creator.reading.countSeriesAsOneBook.hint') }}
        </p>
      </div>
      <ToggleSwitch
        :model-value="countSeriesAsOneBook"
        :aria-label="t('library.creator.reading.countSeriesAsOneBook.title')"
        @update:model-value="handleCountSeriesAsOneBookToggle"
      />
    </div>
  </div>
</template>
