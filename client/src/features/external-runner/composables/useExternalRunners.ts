import { computed, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import type { ExternalRun, ExternalRunEvents, ExternalRunPage, ExternalRunnerConnection, ExternalRunnerDescription } from '@bookorbit/types'
import { api } from '@/lib/api'
import { createUuid } from '@/lib/uuid'

export function useExternalRunners() {
  const { t } = useI18n()
  const connections = ref<ExternalRunnerConnection[]>([])
  const connectionCursor = ref<string | null>(null)
  const selectedId = ref<number | null>(null)
  const connection = computed(() => connections.value.find((item) => item.id === selectedId.value))
  const description = ref<ExternalRunnerDescription | null>(null)
  const runs = ref<ExternalRun[]>([])
  const nextCursor = ref<string | null>(null)
  const selectedRun = ref<ExternalRun | null>(null)
  const events = ref<ExternalRunEvents['items']>([])
  const eventCursor = ref<string | null>(null)
  const error = ref('')
  const checkedAt = ref<string | null>(null)
  const credentialsConfigured = ref(false)
  const busy = ref(false)
  const editing = ref(false)
  const removing = ref(false)
  const form = reactive({ id: null as number | null, name: '', baseUrl: '', token: '', enabled: true, allowPrivateAddress: false })
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = false
  let refreshing = -1
  let browsingHistory = false
  let detailGeneration = 0
  let generation = 0
  const pendingStarts = new Map<string, string>()
  const pendingCancels = new Map<string, string>()
  const observed = new Map<string, string>()

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await api(`/api/v1/external-runners${path}`, init)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message || t('externalRunner.requestFailed'))
    }
    return response.status === 204 ? (undefined as T) : response.json()
  }

  async function loadConnections(append = false) {
    try {
      const result = await request<{ items: ExternalRunnerConnection[]; nextCursor: string | null; credentialsConfigured: boolean }>(
        append && connectionCursor.value ? `?cursor=${connectionCursor.value}` : '',
      )
      connections.value = append ? [...connections.value, ...result.items] : result.items
      connectionCursor.value = result.nextCursor
      credentialsConfigured.value = result.credentialsConfigured
      if (!selectedId.value) selectedId.value = result.items[0]?.id ?? null
    } catch (cause) {
      error.value = message(cause)
    }
  }

  async function refresh() {
    browsingHistory = false
    if (!connection.value?.enabled || refreshing === generation) return
    const id = selectedId.value
    const version = generation
    refreshing = version
    try {
      const [info, page] = await Promise.all([request<ExternalRunnerDescription>(`/${id}/capabilities`), request<ExternalRunPage>(`/${id}/runs`)])
      if (generation !== version || browsingHistory) return
      description.value = info
      runs.value = page.items
      nextCursor.value = page.nextCursor
      checkedAt.value = new Date().toISOString()
      error.value = ''
      for (const run of page.items) {
        const key = `${id}:${info.instanceId}:${run.id}`
        const previous = observed.get(key)
        if (previous && ['queued', 'running'].includes(previous) && !['queued', 'running'].includes(run.state)) {
          toast(t('externalRunner.finished', { name: connection.value?.name, state: run.state }))
        }
        observed.set(key, run.state)
      }
      if (observed.size > 500) observed.clear()
      if (selectedRun.value) {
        const current = page.items.find((run) => run.id === selectedRun.value?.id)
        if (current) selectedRun.value = current
      }
    } catch (cause) {
      if (generation === version) error.value = message(cause)
    } finally {
      if (refreshing === version) refreshing = -1
    }
  }

  async function moreRuns() {
    if (!nextCursor.value || busy.value) return
    browsingHistory = true
    const id = selectedId.value,
      version = generation
    busy.value = true
    try {
      const page = await request<ExternalRunPage>(`/${id}/runs?cursor=${encodeURIComponent(nextCursor.value)}`)
      if (generation !== version) return
      runs.value = page.items
      nextCursor.value = page.nextCursor
    } catch (cause) {
      if (generation === version) error.value = message(cause)
    } finally {
      busy.value = false
    }
  }

  async function inspect(run: ExternalRun, append = false) {
    const detailVersion = ++detailGeneration
    const id = selectedId.value,
      version = generation
    try {
      const [current, page] = await Promise.all([
        request<ExternalRun>(`/${id}/runs/${run.id}`),
        request<ExternalRunEvents>(
          `/${id}/runs/${run.id}/events${append && eventCursor.value ? `?cursor=${encodeURIComponent(eventCursor.value)}` : ''}`,
        ),
      ])
      if (generation !== version) return
      if (detailVersion !== detailGeneration) return
      selectedRun.value = current
      events.value = page.items
      eventCursor.value = page.nextCursor
    } catch (cause) {
      if (generation === version && detailVersion === detailGeneration) error.value = message(cause)
    }
  }

  async function start(jobId: string) {
    if (busy.value) return
    const id = selectedId.value,
      version = generation,
      key = `${selectedId.value}:${jobId}`
    const idempotencyKey = pendingStarts.get(key) ?? createUuid()
    pendingStarts.set(key, idempotencyKey)
    busy.value = true
    try {
      const run = await request<ExternalRun>(`/${id}/runs`, json('POST', { jobId, idempotencyKey }))
      pendingStarts.delete(key)
      if (generation !== version) return
      await refresh()
      await inspect(run)
    } catch (cause) {
      if (generation === version) error.value = message(cause)
    } finally {
      busy.value = false
    }
  }

  async function cancel() {
    if (!selectedRun.value || busy.value) return
    const id = selectedId.value,
      runId = selectedRun.value.id,
      version = generation,
      key = `${id}:${runId}`
    const idempotencyKey = pendingCancels.get(key) ?? createUuid()
    pendingCancels.set(key, idempotencyKey)
    busy.value = true
    try {
      const run = await request<ExternalRun>(`/${id}/runs/${runId}/cancel`, json('POST', { idempotencyKey }))
      pendingCancels.delete(key)
      if (generation === version) await inspect(run)
    } catch (cause) {
      if (generation === version) error.value = message(cause)
    } finally {
      busy.value = false
    }
  }

  function createConnection() {
    Object.assign(form, { id: null, name: '', baseUrl: '', token: '', enabled: true, allowPrivateAddress: false })
    editing.value = true
  }
  function editConnection() {
    if (connection.value) {
      Object.assign(form, connection.value, { token: '' })
      editing.value = true
    }
  }
  function closeEditor() {
    editing.value = false
    form.token = ''
  }
  async function saveConnection() {
    busy.value = true
    try {
      const { id, token, ...value } = form
      const saved = await request<ExternalRunnerConnection>(id ? `/${id}` : '', json(id ? 'PUT' : 'POST', { ...value, ...(token ? { token } : {}) }))
      closeEditor()
      await loadConnections()
      if (!connections.value.some((item) => item.id === saved.id)) connections.value.push(saved)
      selectedId.value = saved.id
      await refresh()
    } catch (cause) {
      error.value = message(cause)
    } finally {
      busy.value = false
    }
  }

  async function removeConnection() {
    if (!selectedId.value || busy.value) return
    busy.value = true
    try {
      await request(`/${selectedId.value}`, { method: 'DELETE' })
      removing.value = false
      selectedId.value = null
      await loadConnections()
    } catch (cause) {
      error.value = message(cause)
    } finally {
      busy.value = false
    }
  }
  function askRemove() {
    removing.value = true
  }
  function closeRemove() {
    removing.value = false
  }

  function clearSelection() {
    detailGeneration++
    selectedRun.value = null
    events.value = []
    eventCursor.value = null
  }
  function message(cause: unknown) {
    return cause instanceof Error ? cause.message : t('externalRunner.requestFailed')
  }
  function json(method: string, body: unknown): RequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  }
  function schedule() {
    clearTimeout(timer)
    if (active)
      timer = setTimeout(async () => {
        if (!document.hidden && !browsingHistory) await refresh()
        schedule()
      }, 5000)
  }
  function activate() {
    if (active) return
    active = true
    if (selectedId.value) void refresh()
    void loadConnections()
    schedule()
  }
  function deactivate() {
    active = false
    generation++
    clearTimeout(timer)
  }
  watch(selectedId, () => {
    generation++
    description.value = null
    runs.value = []
    checkedAt.value = null
    error.value = ''
    clearSelection()
    void refresh()
  })
  onMounted(activate)
  onActivated(activate)
  onDeactivated(deactivate)
  onUnmounted(deactivate)

  return {
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
  }
}
