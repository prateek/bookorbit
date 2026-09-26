<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { CircleCheck, CloudDownload, LoaderCircle, TriangleAlert } from '@lucide/vue'
import type { BookDetail } from '@bookorbit/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isOfflineReadable, useDownloads } from '../composables/useDownloads'

const props = defineProps<{ book: BookDetail; fileId: number; format: string | null }>()

const { t } = useI18n()
const router = useRouter()
const { status, recordFor, download } = useDownloads()

const record = computed(() => recordFor(props.fileId))
const visible = computed(() => status.supported && isOfflineReadable(props.format))
const percent = computed(() => {
  const current = record.value
  if (!current?.sizeBytes) return 0
  return Math.floor((current.bytesDownloaded / current.sizeBytes) * 100)
})
const label = computed(() => {
  const current = record.value
  if (!current) return t('offline.downloadButton.download')
  if (current.state === 'completed') return current.stale ? t('offline.downloads.state.stale') : t('offline.downloadButton.downloaded')
  if (current.state === 'failed') return t('offline.downloadButton.failed')
  return t('offline.downloadButton.progress', { percent: percent.value })
})

/** Starts the download from the tap itself, which is what lets iOS grant persistent storage. */
async function handleClick() {
  if (record.value) {
    void router.push({ name: 'downloads' })
    return
  }
  const queued = await download(props.book, props.fileId).catch(() => null)
  if (queued) toast.success(t('offline.downloadButton.queued'))
  else toast.error(t('offline.unsupported'))
}
</script>

<template>
  <Tooltip v-if="visible">
    <TooltipTrigger as-child>
      <button
        class="relative flex items-center justify-center h-11 sm:h-9 w-12 shrink-0 rounded-md border border-input bg-background hover:bg-muted transition-colors"
        :aria-label="label"
        data-test="offline-download"
        @click="handleClick"
      >
        <CircleCheck v-if="record?.state === 'completed' && !record.stale" class="size-4 text-primary" />
        <TriangleAlert v-else-if="record?.state === 'failed' || record?.stale" class="size-4 text-destructive" />
        <LoaderCircle v-else-if="record" class="size-4 animate-spin" />
        <CloudDownload v-else class="size-4" />
      </button>
    </TooltipTrigger>
    <TooltipContent>{{ label }}</TooltipContent>
  </Tooltip>
</template>
