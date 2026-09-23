import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { AuthUser, ChartConfigEntry, StatisticsChartId } from '@bookorbit/types'

vi.mock('@/features/auth/composables/useAuth', () => ({
  useAuth: vi.fn<() => unknown>(),
}))

vi.mock('@/lib/api', () => ({
  api: vi.fn<() => unknown>(),
}))

vi.mock('vue-sonner', () => ({
  toast: { error: vi.fn<() => void>(), success: vi.fn<() => void>() },
}))

import { useAuth } from '@/features/auth/composables/useAuth'
import { api } from '@/lib/api'
import { toast } from 'vue-sonner'
import { LIBRARY_CHART_IDS } from '../statistics-chart-meta'

const mockUseAuth = vi.mocked(useAuth)
const mockApi = vi.mocked(api)
const mockToast = vi.mocked(toast)

function makeUser(settings: Record<string, unknown> = {}): AuthUser {
  return {
    id: 1,
    username: 'tester',
    name: 'Tester',
    email: undefined,
    active: true,
    isSuperuser: false,
    isDefaultPassword: false,
    settings,
    avatarUrl: null,
    provisioningMethod: 'local',
    permissions: [],
  }
}

function setupAuth(settings: Record<string, unknown> = {}) {
  const userRef = ref<AuthUser | null>(makeUser(settings))
  mockUseAuth.mockReturnValue({ user: userRef } as unknown as ReturnType<typeof useAuth>)
  return { userRef }
}

const LEGACY_USER_CHART_ORDER_WITH_SOURCE_SECOND: StatisticsChartId[] = [
  'reading-heatmap',
  'reading-source-distribution',
  'peak-reading-hours',
  'favorite-reading-days',
  'completion-timeline',
  'goal-trajectory',
  'progress-funnel',
  'completion-latency',
  'genre-reading-time',
  'reading-pace',
  'books-completed',
  'reading-clock',
  'reading-session-timeline',
  'session-archetypes',
]

const LEGACY_LIBRARY_CHART_ORDER_HEALTH_FIRST: StatisticsChartId[] = [
  'library-integrity-gauge',
  'format-distribution',
  'metadata-score-distribution',
  'metadata-freshness-gauge',
  'largest-books',
  'genre-distribution',
  'format-share-over-time',
  'top-authors',
  'metadata-completeness',
  'acquisition-lag-scatter',
  'library-metadata-completeness',
  'storage-by-format',
  'language-distribution',
  'page-count-distribution',
  'publication-decade',
  'genre-cooccurrence',
  'top-series',
  'books-added-over-time',
  'publication-year-timeline',
]

function chartEntries(ids: StatisticsChartId[]): ChartConfigEntry[] {
  return ids.map((id, order) => ({ id, order, visible: true }))
}

describe('useStatisticsConfig - persist', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    mockApi.mockResolvedValue(new Response(null, { status: 200 }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends settings to PATCH /api/v1/users/me/settings', async () => {
    setupAuth()

    const { useStatisticsConfig } = await import('./useStatisticsConfig')
    const { init, toggleVisibility } = useStatisticsConfig()
    init()

    toggleVisibility('format-distribution')
    await vi.advanceTimersByTimeAsync(700)
    await flushPromises()

    expect(mockApi).toHaveBeenCalledWith(
      '/api/v1/users/me/settings',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const body = JSON.parse((mockApi.mock.calls[0]![1] as { body: string }).body)
    expect(body).toHaveProperty('settings.statisticsConfig')
    expect(body.settings.statisticsConfig).toHaveProperty('charts')
    expect(body.settings.statisticsConfig).toHaveProperty('filters')
  })

  it('shows error toast when API call throws', async () => {
    setupAuth()
    mockApi.mockRejectedValueOnce(new Error('network error'))

    const { useStatisticsConfig } = await import('./useStatisticsConfig')
    const { init, toggleVisibility } = useStatisticsConfig()
    init()

    toggleVisibility('format-distribution')
    await vi.advanceTimersByTimeAsync(700)
    await flushPromises()

    expect(mockToast.error).toHaveBeenCalledWith('Failed to save chart configuration')
  })

  it('migrates the old default user chart order to put Where You Read last', async () => {
    setupAuth({
      statisticsConfig: {
        charts: chartEntries(LEGACY_USER_CHART_ORDER_WITH_SOURCE_SECOND),
      },
    })

    const { useStatisticsConfig } = await import('./useStatisticsConfig')
    const { init, orderedUserCharts } = useStatisticsConfig()
    init()

    const chartIds = orderedUserCharts.value.map((chart) => chart.id)
    expect(chartIds[1]).toBe('peak-reading-hours')
    expect(chartIds.at(-1)).toBe('reading-source-distribution')
  })

  it('moves a saved copy of the old health-first library order to the reader-first defaults', async () => {
    setupAuth({
      statisticsConfig: {
        charts: chartEntries(LEGACY_LIBRARY_CHART_ORDER_HEALTH_FIRST),
      },
    })

    const { useStatisticsConfig } = await import('./useStatisticsConfig')
    const { init, orderedLibraryCharts } = useStatisticsConfig()
    init()

    expect(orderedLibraryCharts.value.map((chart) => chart.id)).toEqual(LIBRARY_CHART_IDS)
  })

  it('keeps a library order the reader customised', async () => {
    const customised: StatisticsChartId[] = [...LEGACY_LIBRARY_CHART_ORDER_HEALTH_FIRST.slice(1), LEGACY_LIBRARY_CHART_ORDER_HEALTH_FIRST[0]!]
    setupAuth({ statisticsConfig: { charts: chartEntries(customised) } })

    const { useStatisticsConfig } = await import('./useStatisticsConfig')
    const { init, orderedLibraryCharts } = useStatisticsConfig()
    init()

    expect(orderedLibraryCharts.value.map((chart) => chart.id)).toEqual(customised)
  })
})
