<script setup lang="ts">
import { computed, useId, type Component } from 'vue'

const props = defineProps<{
  modelValue: number
  min: number
  max: number
  step: number
  label: string
  /** Human-readable current value, shown beside the track and announced in place of the raw number. */
  displayValue: string
  minIcon?: Component
  maxIcon?: Component
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const inputId = `reader-range-${useId()}`

const fillPercent = computed(() => {
  const span = props.max - props.min
  if (span <= 0) return 0
  return ((props.modelValue - props.min) / span) * 100
})

function onInput(event: Event) {
  emit('update:modelValue', Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div>
    <label :for="inputId" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ label }}</label>
    <div class="flex items-center gap-2.5">
      <component :is="minIcon" v-if="minIcon" :size="15" class="shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        :id="inputId"
        type="range"
        class="reader-range min-w-0 flex-1"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :aria-valuetext="displayValue"
        :style="{ '--reader-range-fill': `${fillPercent}%` }"
        @input="onInput"
      />
      <component :is="maxIcon" v-if="maxIcon" :size="15" class="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="w-16 shrink-0 text-right text-[13px] font-semibold tabular-nums text-foreground">{{ displayValue }}</span>
    </div>
  </div>
</template>

<style scoped>
/* The input is a tall, transparent hit area; the visible track is drawn by the pseudo-elements. */
.reader-range {
  appearance: none;
  height: 36px;
  background: transparent;
  cursor: pointer;
}

.reader-range:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 999px;
}

.reader-range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--primary) var(--reader-range-fill), var(--border) var(--reader-range-fill));
}

.reader-range::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: var(--border);
}

.reader-range::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--primary);
}

.reader-range::-webkit-slider-thumb {
  appearance: none;
  width: 22px;
  height: 22px;
  margin-top: -8px;
  border: 2px solid var(--card);
  border-radius: 999px;
  background: var(--primary);
  box-shadow: var(--elevation-sm);
}

.reader-range::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border: 2px solid var(--card);
  border-radius: 999px;
  background: var(--primary);
  box-shadow: var(--elevation-sm);
}

@media (pointer: coarse) {
  .reader-range {
    height: 44px;
  }

  .reader-range::-webkit-slider-thumb {
    width: 28px;
    height: 28px;
    margin-top: -11px;
  }

  .reader-range::-moz-range-thumb {
    width: 28px;
    height: 28px;
  }
}
</style>
