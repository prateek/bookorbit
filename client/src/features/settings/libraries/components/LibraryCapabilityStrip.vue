<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarClock, Eye, FileEdit, Pencil } from '@lucide/vue'
import type { Library } from '@bookorbit/types'
import { parseCronToHuman } from '@/features/library/utils/cron'

const props = defineProps<{ library: Library }>()

const { t, locale } = useI18n()

/**
 * Every slot renders in both states. An omitted chip and a disabled setting used to look the same,
 * which made a library's configuration unreadable from the list.
 */
const slots = computed(() => {
  const schedule = parseCronToHuman(props.library.autoScanCronExpression, locale.value)
  return [
    { key: 'watch', icon: Eye, on: props.library.watch, label: t('settings.admin.libraries.capability.watch'), detail: null },
    { key: 'schedule', icon: CalendarClock, on: Boolean(schedule), label: t('settings.admin.libraries.capability.schedule'), detail: schedule },
    { key: 'fileWrite', icon: FileEdit, on: props.library.fileWriteEnabled, label: t('settings.admin.libraries.capability.fileWrite'), detail: null },
    {
      key: 'fileRename',
      icon: Pencil,
      on: props.library.fileRenameEnabled,
      label: t('settings.admin.libraries.capability.fileRename'),
      detail: null,
    },
  ]
})

function slotTitle(slot: { label: string; on: boolean; detail: string | null }): string {
  if (!slot.on) return t('settings.admin.libraries.capability.off', { name: slot.label })
  return slot.detail ? `${slot.label}: ${slot.detail}` : t('settings.admin.libraries.capability.on', { name: slot.label })
}
</script>

<template>
  <ul class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
    <li
      v-for="slot in slots"
      :key="slot.key"
      class="inline-flex items-center gap-1"
      :class="slot.on ? 'text-foreground' : 'text-muted-foreground'"
      data-testid="library-capability"
    >
      <component :is="slot.icon" :size="12" :class="slot.on ? '' : 'opacity-60'" aria-hidden="true" />
      <span>{{ slotTitle(slot) }}</span>
    </li>
  </ul>
</template>
