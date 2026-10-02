<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EpubReaderSettings } from '@bookorbit/types'
import type { ReaderState } from '../epub/composables/useReaderState'
import ReaderRangeField from '../shared/components/ReaderRangeField.vue'
import ReaderSegmentedControl from '../shared/components/ReaderSegmentedControl.vue'

const props = defineProps<{ state: ReaderState }>()
const emit = defineEmits<{ update: [patch: Partial<ReaderState>] }>()
const { t } = useI18n()
const informationOptions = computed(() => [
  { value: 'hidden', label: t('reader.settings.readingLayout.hidden') },
  { value: 'progress', label: t('reader.settings.readingLayout.progress') },
  { value: 'full', label: t('reader.settings.readingLayout.full') },
])
const sideMarginPercent = computed(() => Math.round(props.state.gap * 100))

function setInformation(value: string) {
  emit('update', { informationDisplay: value as EpubReaderSettings['informationDisplay'] })
}
function setSideMargins(value: number) {
  emit('update', { gap: Math.round(value) / 100 })
}
function setVerticalMargin(value: number) {
  emit('update', { verticalMargin: value })
}
</script>

<template>
  <section class="space-y-3 border-b border-border px-4 py-3.5" data-testid="reading-layout-setting">
    <div>
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('reader.settings.readingLayout.information') }}</p>
      <ReaderSegmentedControl
        :options="informationOptions"
        :model-value="state.informationDisplay ?? 'full'"
        :aria-label="t('reader.settings.readingLayout.information')"
        @update:model-value="setInformation"
      />
    </div>
    <ReaderRangeField
      :model-value="sideMarginPercent"
      :min="0"
      :max="50"
      :step="1"
      :label="t('reader.settings.readingLayout.sideMargins')"
      :display-value="t('reader.settings.percent', { value: sideMarginPercent })"
      @update:model-value="setSideMargins"
    />
    <ReaderRangeField
      :model-value="state.verticalMargin ?? 24"
      :min="0"
      :max="80"
      :step="2"
      :label="t('reader.settings.readingLayout.verticalMargin')"
      :display-value="t('reader.settings.readingLayout.pixels', { value: state.verticalMargin ?? 24 })"
      @update:model-value="setVerticalMargin"
    />
    <p class="text-xs text-muted-foreground">{{ t('reader.settings.readingLayout.verticalHint') }}</p>
  </section>
</template>
