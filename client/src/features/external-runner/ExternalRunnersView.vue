<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { SECRET_INPUT_ATTRS } from '@/lib/secret-input'
import { useExternalRunners } from './composables/useExternalRunners'

const { t } = useI18n()
const { hasPermission } = usePermissions()
const {
  connections,
  connectionCursor,
  loadConnections,
  selectedId,
  connection,
  description,
  runs,
  nextCursor,
  selectedRun,
  events,
  eventCursor,
  error,
  checkedAt,
  credentialsConfigured,
  busy,
  editing,
  removing,
  askRemove,
  closeRemove,
  removeConnection,
  form,
  refresh,
  moreRuns,
  inspect,
  start,
  cancel,
  createConnection,
  editConnection,
  closeEditor,
  saveConnection,
  clearSelection,
} = useExternalRunners()
const canConfigure = computed(() => hasPermission('manage_app_settings'))
const canCancel = computed(
  () =>
    selectedRun.value &&
    ['queued', 'running'].includes(selectedRun.value.state) &&
    description.value?.jobs.some((job) => job.id === selectedRun.value?.jobId && job.canCancel),
)
const running = computed(() => runs.value.some((run) => ['queued', 'running'].includes(run.state)))
function date(value: string) {
  return new Date(value).toLocaleString()
}
function moreConnections() {
  void loadConnections(true)
}
function moreEvents() {
  if (selectedRun.value) void inspect(selectedRun.value, true)
}
function refreshDetail() {
  if (selectedRun.value) void inspect(selectedRun.value)
}
</script>

<template>
  <section class="h-full overflow-y-auto space-y-6 pb-8" :aria-label="t('externalRunner.title')">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ t('externalRunner.title') }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('externalRunner.subtitle') }}</p>
      </div>
      <Button v-if="canConfigure" variant="outline" @click="createConnection">{{ t('externalRunner.add') }}</Button>
    </header>
    <p v-if="error" role="alert" class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
      {{ error }} {{ t('externalRunner.stale') }}
    </p>
    <form v-if="editing" class="rounded-xl border bg-card p-5 space-y-4" @submit.prevent="saveConnection">
      <h2 class="font-semibold">{{ t('externalRunner.connection') }}</h2>
      <p v-if="!credentialsConfigured" class="text-sm text-destructive">{{ t('externalRunner.keyRequired') }}</p>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="space-y-1 text-sm"
          >{{ t('externalRunner.name')
          }}<input v-model="form.name" required maxlength="100" class="block w-full rounded-md border bg-background px-3 py-2"
        /></label>
        <label class="space-y-1 text-sm"
          >{{ t('externalRunner.url')
          }}<input
            v-model="form.baseUrl"
            required
            type="url"
            class="block w-full rounded-md border bg-background px-3 py-2"
            placeholder="https://runner.example.com"
        /></label>
      </div>
      <label class="block space-y-1 text-sm"
        >{{ t('externalRunner.token')
        }}<input
          v-model="form.token"
          type="text"
          v-bind="SECRET_INPUT_ATTRS"
          :required="!form.id"
          minlength="16"
          class="input-secret block w-full rounded-md border bg-background px-3 py-2"
        /><span class="text-xs text-muted-foreground">{{ t('externalRunner.tokenHint') }}</span></label
      >
      <label class="flex gap-2 items-center text-sm"
        ><input v-model="form.allowPrivateAddress" type="checkbox" />{{ t('externalRunner.private') }}</label
      >
      <label class="flex gap-2 items-center text-sm"><input v-model="form.enabled" type="checkbox" />{{ t('externalRunner.enabled') }}</label>
      <p class="text-xs text-muted-foreground">{{ t('externalRunner.scheduleBoundary') }}</p>
      <div class="flex gap-2">
        <Button type="submit" :disabled="busy || !credentialsConfigured">{{ t('externalRunner.save') }}</Button
        ><Button type="button" variant="ghost" @click="closeEditor">{{ t('externalRunner.close') }}</Button>
      </div>
    </form>
    <div v-if="!connections.length && !editing" class="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
      {{ t('externalRunner.empty') }}
    </div>
    <div v-if="connections.length" class="flex flex-wrap items-end gap-3">
      <label class="flex-1 min-w-48 text-sm"
        >{{ t('externalRunner.connection')
        }}<select v-model="selectedId" class="mt-1 block w-full rounded-md border bg-background p-2">
          <option v-for="item in connections" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select></label
      >
      <Button v-if="connectionCursor" variant="ghost" @click="moreConnections">{{ t('externalRunner.moreConnections') }}</Button>
      <Button v-if="canConfigure" variant="ghost" @click="askRemove">{{ t('externalRunner.remove') }}</Button>
      <Button v-if="canConfigure" variant="outline" @click="editConnection">{{ t('externalRunner.edit') }}</Button>
      <Button variant="outline" :disabled="busy || !connection?.enabled" @click="refresh">{{ t('externalRunner.refresh') }}</Button>
    </div>
    <p v-if="connection && !connection.enabled" class="text-sm text-muted-foreground">{{ t('externalRunner.disabled') }}</p>
    <div v-if="description && connection?.enabled" class="grid gap-3 md:grid-cols-2">
      <article v-for="job in description.jobs" :key="job.id" class="rounded-xl border bg-card p-5 flex items-center justify-between gap-4">
        <div>
          <h2 class="font-medium">{{ job.label }}</h2>
          <p class="mt-1 text-xs text-muted-foreground">{{ job.schedule || t('externalRunner.externalSchedule') }}</p>
        </div>
        <Button v-if="job.canStart" :disabled="busy || running" @click="start(job.id)">{{ t('externalRunner.runNow') }}</Button>
      </article>
    </div>
    <div v-if="connection?.enabled" class="space-y-3">
      <div class="flex flex-wrap justify-between gap-2">
        <h2 class="font-semibold">{{ t('externalRunner.history') }}</h2>
        <span v-if="checkedAt" class="text-xs text-muted-foreground">{{ t('externalRunner.checked', { time: date(checkedAt) }) }}</span>
      </div>
      <p v-if="!runs.length" class="text-sm text-muted-foreground">{{ t('externalRunner.noRuns') }}</p>
      <button
        v-for="run in runs"
        :key="run.id"
        class="w-full rounded-lg border bg-card p-4 text-left hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary"
        @click="inspect(run)"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">{{ t(`externalRunner.states.${run.state}`) }}</span
          ><span class="text-xs text-muted-foreground">{{ date(run.startedAt) }}</span>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ run.jobId }} · {{ t(`externalRunner.origins.${run.origin}`) }}<span v-if="run.phase"> · {{ run.phase }}</span>
        </p>
        <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <span v-for="(count, key) in run.counters" :key="key" class="text-sm"
            ><strong class="tabular-nums">{{ count }}</strong> {{ key }}</span
          >
        </div>
      </button>
      <Button v-if="nextCursor" variant="outline" :disabled="busy" @click="moreRuns">{{ t('externalRunner.older') }}</Button>
    </div>
    <aside v-if="selectedRun" class="rounded-xl border bg-card p-5 space-y-4" :aria-label="t('externalRunner.details')">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold">{{ t('externalRunner.details') }}</h2>
        <div class="flex gap-2">
          <Button variant="outline" @click="refreshDetail">{{ t('externalRunner.refresh') }}</Button
          ><Button variant="ghost" @click="clearSelection">{{ t('externalRunner.close') }}</Button>
        </div>
      </div>
      <p class="break-all font-mono text-xs text-muted-foreground">{{ selectedRun.id }}</p>
      <p>{{ selectedRun.message || selectedRun.phase || t(`externalRunner.states.${selectedRun.state}`) }}</p>
      <p class="text-sm text-muted-foreground">{{ t('externalRunner.importUnconfirmed') }}</p>
      <Button v-if="canCancel" variant="outline" :disabled="busy" @click="cancel">{{ t('externalRunner.cancel') }}</Button>
      <p v-else-if="['queued', 'running'].includes(selectedRun.state)" class="text-sm text-muted-foreground">
        {{ t('externalRunner.cancelUnavailable') }}
      </p>
      <ol class="space-y-2 text-sm">
        <li v-for="event in events" :key="event.id" class="rounded-md bg-muted/40 p-3 break-words">
          <time class="mr-2 text-xs text-muted-foreground">{{ date(event.timestamp) }}</time
          >{{ event.message }}
        </li>
      </ol>
      <Button v-if="eventCursor" variant="outline" @click="moreEvents">{{ t('externalRunner.moreEvents') }}</Button>
    </aside>
    <ConfirmDialog
      :open="removing"
      :title="t('externalRunner.remove')"
      :description="t('externalRunner.removeHint')"
      :confirm-label="t('externalRunner.remove')"
      :busy="busy"
      @confirm="removeConnection"
      @cancel="closeRemove"
    />
  </section>
</template>
