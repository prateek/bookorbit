import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useExternalRunners } from './useExternalRunners'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: vi.fn<typeof api>() }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-sonner', () => ({ toast: vi.fn<() => void>() }))
const connection = { id: 1, name: 'Fixture', baseUrl: 'http://runner.test', enabled: true, allowPrivateAddress: false }
const run = {
  id: 'exec_1',
  jobId: 'sync',
  origin: 'manual',
  state: 'running',
  startedAt: '2026-10-27T12:00:00Z',
  finishedAt: null,
  phase: null,
  counters: { held: 2 },
  message: null,
  childRunIds: [],
  importStatus: 'unconfirmed',
}
let state: ReturnType<typeof useExternalRunners>
let wrapper: ReturnType<typeof mount>
let offline = false
let acceptedButDisconnected = false
let rejectFirstStart = false
const starts: string[] = []
function response(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
}

beforeEach(async () => {
  vi.useFakeTimers()
  starts.length = 0
  offline = false
  acceptedButDisconnected = false
  rejectFirstStart = false
  vi.mocked(api)
    .mockReset()
    .mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === '/api/v1/external-runners') return response({ items: [connection], nextCursor: null, credentialsConfigured: true })
      if (init?.method === 'POST') {
        starts.push(JSON.parse(String(init.body)).idempotencyKey)
        if (rejectFirstStart && !acceptedButDisconnected) {
          acceptedButDisconnected = true
          throw new Error('Connection lost after acceptance')
        }
        return response(run)
      }
      if (offline) throw new Error('Runner unavailable')
      if (path.endsWith('/capabilities'))
        return response({
          protocolVersion: 1,
          instanceId: 'fixture',
          name: 'Fixture',
          jobs: [{ id: 'sync', label: 'Sync', canStart: true, canCancel: false, schedule: null }],
        })
      if (path.includes('/events')) return response({ items: [], nextCursor: null })
      if (path.endsWith('/exec_1')) return response(run)
      if (path.includes('cursor=')) return response({ items: [{ ...run, id: 'exec_old', state: 'succeeded' }], nextCursor: null })
      return response({ items: [run], nextCursor: '42' })
    })
  wrapper = mount(
    defineComponent({
      setup() {
        state = useExternalRunners()
        return () => h('div')
      },
    }),
  )
  await flushPromises()
})
afterEach(() => {
  wrapper.unmount()
  vi.useRealTimers()
})

describe('runner controls', () => {
  it('retains the same idempotency key after an uncertain start response', async () => {
    rejectFirstStart = true
    await state.start('sync')
    expect(state.error.value).toContain('after acceptance')
    await state.start('sync')
    expect(starts).toHaveLength(2)
    expect(starts[0]).toBe(starts[1])
    await state.start('sync')
    expect(starts[2]).not.toBe(starts[1])
  })
  it('keeps last known runs and freshness when disconnected', async () => {
    const checked = state.checkedAt.value
    offline = true
    await state.refresh()
    expect(state.runs.value[0]?.state).toBe('running')
    expect(state.checkedAt.value).toBe(checked)
    expect(state.error.value).toContain('unavailable')
  })
  it('uses bounded pages and does not overwrite older history on polling', async () => {
    await state.moreRuns()
    expect(state.runs.value.map((r) => r.id)).toEqual(['exec_old'])
    await vi.advanceTimersByTimeAsync(10000)
    expect(state.runs.value.map((r) => r.id)).toEqual(['exec_old'])
    await state.refresh()
    expect(state.runs.value.map((r) => r.id)).toEqual(['exec_1'])
  })
  it('stops polling when unmounted', async () => {
    wrapper.unmount()
    const calls = vi.mocked(api).mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(api).toHaveBeenCalledTimes(calls)
  })
  it('does not let an in-flight poll replace the requested history page', async () => {
    let resolve!: (value: Response) => void
    vi.mocked(api).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = state.refresh()
    await state.moreRuns()
    resolve(response({ protocolVersion: 1, instanceId: 'fixture', name: 'Fixture', jobs: [] }))
    await pending
    expect(state.runs.value.map((run) => run.id)).toEqual(['exec_old'])
  })
  it('does not attach a late response to a different connection', async () => {
    let resolve!: (value: Response) => void
    vi.mocked(api).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = state.refresh()
    state.selectedId.value = null
    await nextTick()
    resolve(response({ protocolVersion: 1, instanceId: 'old', name: 'Old', jobs: [] }))
    await pending
    expect(state.description.value).toBeNull()
    expect(state.runs.value).toEqual([])
  })
})
