import { onMounted, ref } from 'vue'

import type { PodcastEpisodeListItem } from '@bookorbit/types'
import { onAppResumed } from '@/components/sidebar/useAppResume'
import { api } from '@/lib/api'

const MAX_LIMIT = 50

/**
 * The dashboard's podcast shelf. Unlike the book scrollers this does not go through
 * `/dashboard/scrollers/:type`: podcast progress lives in the podcast module, which already exposes
 * a cross-library resume feed scoped to the libraries the user can reach.
 */
export function useDashboardPodcastScroller(limit = 20) {
  const episodes = ref<PodcastEpisodeListItem[]>([])
  const loading = ref(true)
  const error = ref(false)

  async function fetchEpisodes(): Promise<PodcastEpisodeListItem[]> {
    const size = Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT)
    const res = await api(`/api/v1/podcast-episodes/continue?size=${size}`)
    if (!res.ok) throw new Error()
    return res.json()
  }

  let requestToken = 0

  async function load() {
    const token = ++requestToken
    loading.value = true
    error.value = false
    try {
      const fresh = await fetchEpisodes()
      if (token === requestToken) episodes.value = fresh
    } catch {
      if (token === requestToken) error.value = true
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  async function reloadInPlace() {
    if (loading.value) return
    if (error.value) return load()
    const token = ++requestToken
    try {
      const fresh = await fetchEpisodes()
      if (token === requestToken) episodes.value = fresh
    } catch {
      // The shelf on screen is still usable.
    }
  }

  onAppResumed(reloadInPlace)
  onMounted(load)
  return { episodes, loading, error, refresh: load }
}
