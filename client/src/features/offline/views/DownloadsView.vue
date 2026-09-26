<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloudOff, HardDrive, RefreshCw, ShieldCheck } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/formatting'
import { formatDateTime } from '@/i18n/formatters'
import DownloadRow from '../components/DownloadRow.vue'
import { useDownloads } from '../composables/useDownloads'

const { t } = useI18n()
const { status, offlineMode, downloads, downloadedBytes, pause, resume, remove, syncNow, requestPersistentStorage, refreshStorage } = useDownloads()

onMounted(() => {
  void refreshStorage()
})

const lastSync = computed(() => (status.lastSyncAt ? formatDateTime(new Date(status.lastSyncAt)) : t('offline.sync.never')))
const storageLine = computed(() =>
  status.storage.usage !== null && status.storage.quota !== null
    ? t('offline.storage.browser', { used: formatBytes(status.storage.usage), quota: formatBytes(status.storage.quota) })
    : t('offline.storage.unknown'),
)

function handlePause(fileId: number) {
  void pause(fileId)
}

function handleResume(fileId: number) {
  void resume(fileId)
}

function handleRemove(fileId: number) {
  void remove(fileId)
}

function handleSyncNow() {
  void syncNow()
}

function handlePersist() {
  void requestPersistentStorage()
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-4 pb-8">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold">{{ t('offline.downloads.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('offline.downloads.description') }}</p>
    </header>

    <div v-if="offlineMode" role="status" class="flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
      <CloudOff class="mt-0.5 size-4 shrink-0" />
      <span>{{ t('offline.mode.banner') }}</span>
    </div>

    <div v-if="!status.supported" role="alert" class="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {{ t('offline.unsupported') }}
    </div>

    <section class="flex flex-col gap-3">
      <p v-if="downloads.length === 0" class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {{ t('offline.downloads.empty') }}
      </p>
      <ul v-else class="flex flex-col gap-2">
        <DownloadRow
          v-for="record in downloads"
          :key="record.fileId"
          :record="record"
          @pause="handlePause"
          @resume="handleResume"
          @remove="handleRemove"
        />
      </ul>
    </section>

    <section class="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <h2 class="flex items-center gap-2 font-medium"><HardDrive class="size-4" />{{ t('offline.storage.title') }}</h2>
      <p class="text-sm">{{ t('offline.storage.downloads', { size: formatBytes(downloadedBytes), count: downloads.length }) }}</p>
      <p class="text-sm text-muted-foreground">{{ storageLine }}</p>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <template v-if="status.storage.persisted">
          <ShieldCheck class="size-4 text-primary" />
          <span>{{ t('offline.storage.persisted') }}</span>
        </template>
        <template v-else>
          <span class="text-muted-foreground">{{ t('offline.storage.notPersisted') }}</span>
          <Button size="sm" variant="outline" @click="handlePersist">{{ t('offline.storage.persist') }}</Button>
        </template>
      </div>
    </section>

    <section class="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-medium">{{ t('offline.sync.title') }}</h2>
        <Button size="sm" variant="outline" :disabled="status.syncing || !status.ready" @click="handleSyncNow">
          <RefreshCw :class="status.syncing ? 'animate-spin' : ''" />
          {{ t('offline.sync.now') }}
        </Button>
      </div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-muted-foreground">{{ t('offline.sync.lastSync') }}</dt>
        <dd>{{ lastSync }}</dd>
        <dt class="text-muted-foreground">{{ t('offline.sync.pending') }}</dt>
        <dd>{{ status.outboxCount }}</dd>
        <dt class="text-muted-foreground">{{ t('offline.sync.outcome') }}</dt>
        <dd>{{ status.lastOutcome ? t(`offline.sync.outcomes.${status.lastOutcome}`) : '-' }}</dd>
        <dt class="text-muted-foreground">{{ t('offline.sync.device') }}</dt>
        <dd class="truncate font-mono text-xs leading-5">{{ status.deviceId ?? '-' }}</dd>
      </dl>
      <p v-if="status.lastError" class="text-sm text-destructive">{{ status.lastError }}</p>
      <details v-if="status.failures.length > 0" class="text-sm">
        <summary class="cursor-pointer text-muted-foreground">{{ t('offline.sync.failures', { count: status.failures.length }) }}</summary>
        <ul class="mt-2 flex flex-col gap-1">
          <li v-for="failure in status.failures" :key="`${failure.at}-${failure.kind}`" class="text-xs">
            <span class="text-muted-foreground">{{ formatDateTime(new Date(failure.at)) }}</span>
            {{ failure.kind }} · {{ failure.status }} · {{ failure.message }}
          </li>
        </ul>
      </details>
    </section>
  </div>
</template>
