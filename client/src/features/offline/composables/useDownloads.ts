import { computed } from 'vue'
import type { BookDetail } from '@bookorbit/types'
import type { DownloadRecord } from '../lib/offline-db'
import { offlineMode } from '../offline-mode'
import { currentOfflineSession, downloadBookFile, refreshStorage, requestPersistentStorage, runSync, useOfflineStatus } from '../offline-session'

/** Formats the reader opens from a downloaded file. CBZ pages are still fetched one at a time from the server. */
export const OFFLINE_READABLE_FORMATS = new Set(['epub', 'pdf', 'mobi', 'azw3', 'azw', 'fb2', 'fbz'])

export function isOfflineReadable(format: string | null | undefined): boolean {
  return !!format && OFFLINE_READABLE_FORMATS.has(format.toLowerCase())
}

export function useDownloads() {
  const status = useOfflineStatus()

  const downloads = computed(() => [...status.downloads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  const downloadedBytes = computed(() => status.downloads.reduce((total, record) => total + record.bytesDownloaded, 0))
  const activeCount = computed(() => status.downloads.filter((record) => record.state === 'downloading' || record.state === 'queued').length)

  function recordFor(fileId: number): DownloadRecord | null {
    return status.downloads.find((record) => record.fileId === fileId) ?? null
  }

  async function download(detail: BookDetail, fileId: number) {
    return downloadBookFile(detail, fileId)
  }

  async function pause(fileId: number) {
    await currentOfflineSession()?.downloads.pause(fileId)
  }

  /** Also retries a failed download and replaces a stale one with the server's current file. */
  async function resume(fileId: number) {
    await currentOfflineSession()?.downloads.resume(fileId)
  }

  async function remove(fileId: number) {
    await currentOfflineSession()?.downloads.remove(fileId)
    await refreshStorage()
  }

  return {
    status,
    offlineMode,
    downloads,
    downloadedBytes,
    activeCount,
    recordFor,
    download,
    pause,
    resume,
    remove,
    syncNow: () => runSync('manual'),
    requestPersistentStorage,
    refreshStorage,
  }
}
