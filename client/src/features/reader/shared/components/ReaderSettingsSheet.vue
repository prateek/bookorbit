<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ReaderBottomSheet, { type ReaderSheetSnap } from './ReaderBottomSheet.vue'

const { t } = useI18n()

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

// Opens at half height so the page stays visible while a setting changes; the grabber expands it.
const snap = ref<ReaderSheetSnap>('peek')

function onOpenChange(open: boolean) {
  emit('update:open', open)
}

function onSnapChange(value: ReaderSheetSnap) {
  snap.value = value
}

watch(
  () => props.open,
  (open) => {
    if (open) snap.value = 'peek'
  },
)
</script>

<template>
  <ReaderBottomSheet
    :open="props.open"
    :snap="snap"
    :label="t('reader.settings.ariaLabel')"
    :close-label="t('reader.settings.close')"
    @update:open="onOpenChange"
    @update:snap="onSnapChange"
  >
    <slot />
  </ReaderBottomSheet>
</template>
