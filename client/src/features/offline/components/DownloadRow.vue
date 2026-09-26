<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { BookOpen, Pause, Play, RotateCcw, Trash2, TriangleAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/formatting'
import type { DownloadRecord } from '../lib/offline-db'
import { getBookSnapshot } from '../offline-session'

const props = defineProps<{ record: DownloadRecord }>()
const emit = defineEmits<{ pause: [fileId: number]; resume: [fileId: number]; remove: [fileId: number] }>()

const { t } = useI18n()
const router = useRouter()
const coverUrl = ref<string | null>(null)

onMounted(async () => {
  const snapshot = await getBookSnapshot(props.record.bookId)
  if (snapshot?.cover) coverUrl.value = URL.createObjectURL(snapshot.cover)
})

onBeforeUnmount(() => {
  if (coverUrl.value) URL.revokeObjectURL(coverUrl.value)
})

const percent = computed(() => {
  if (props.record.state === 'completed') return 100
  if (!props.record.sizeBytes) return 0
  return Math.min(100, Math.floor((props.record.bytesDownloaded / props.record.sizeBytes) * 100))
})

const stateLabel = computed(() => {
  if (props.record.state === 'completed' && props.record.stale) return t('offline.downloads.state.stale')
  if (props.record.state === 'failed') return t(`offline.downloads.failure.${props.record.failure ?? 'server'}`)
  if (props.record.state === 'queued' && props.record.failure === 'network') return t('offline.downloads.state.waiting')
  return t(`offline.downloads.state.${props.record.state}`)
})

const canPause = computed(() => props.record.state === 'downloading' || props.record.state === 'queued')
const canResume = computed(
  () => props.record.state === 'paused' || props.record.state === 'failed' || (props.record.state === 'completed' && props.record.stale),
)

function handleRead() {
  void router.push({ name: 'reader', params: { bookId: props.record.bookId, fileId: props.record.fileId }, query: { format: props.record.format } })
}

function handlePause() {
  emit('pause', props.record.fileId)
}

function handleResume() {
  emit('resume', props.record.fileId)
}

function handleRemove() {
  emit('remove', props.record.fileId)
}
</script>

<template>
  <li class="flex gap-3 rounded-lg border bg-card p-3">
    <div class="h-20 w-14 shrink-0 overflow-hidden rounded bg-muted">
      <img v-if="coverUrl" :src="coverUrl" alt="" class="h-full w-full object-cover" />
    </div>
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <div class="min-w-0">
        <p class="truncate font-medium">{{ record.title }}</p>
        <p class="truncate text-sm text-muted-foreground">{{ record.authors.join(', ') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span class="rounded bg-muted px-1.5 py-0.5 font-medium uppercase">{{ record.format }}</span>
        <span :class="record.state === 'failed' || record.stale ? 'text-destructive' : ''">{{ stateLabel }}</span>
        <span>{{ t('offline.downloads.bytes', { done: formatBytes(record.bytesDownloaded), total: formatBytes(record.sizeBytes) }) }}</span>
      </div>
      <div
        v-if="record.state !== 'completed'"
        class="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        :aria-valuenow="percent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="h-full rounded-full bg-primary transition-[width]" :style="{ width: `${percent}%` }" />
      </div>
      <p v-if="record.error && record.state === 'failed'" class="flex items-center gap-1 text-xs text-destructive">
        <TriangleAlert class="size-3.5" />
        <span class="truncate">{{ record.error }}</span>
      </p>
      <div class="flex flex-wrap gap-1">
        <Button v-if="record.state === 'completed'" size="sm" variant="secondary" @click="handleRead">
          <BookOpen />
          {{ t('offline.downloads.read') }}
        </Button>
        <Button v-if="canPause" size="sm" variant="ghost" @click="handlePause">
          <Pause />
          {{ t('offline.downloads.pause') }}
        </Button>
        <Button v-if="canResume" size="sm" variant="ghost" @click="handleResume">
          <component :is="record.state === 'paused' ? Play : RotateCcw" />
          {{
            record.state === 'paused' ? t('offline.downloads.resume') : record.stale ? t('offline.downloads.update') : t('offline.downloads.retry')
          }}
        </Button>
        <Button size="sm" variant="destructive-ghost" @click="handleRemove">
          <Trash2 />
          {{ t('offline.downloads.remove') }}
        </Button>
      </div>
    </div>
  </li>
</template>
