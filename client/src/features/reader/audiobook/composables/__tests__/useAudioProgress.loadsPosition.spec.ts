import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioProgress } from '../useAudioProgress'

const apiMock = vi.hoisted(() => vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>())
vi.mock('@/lib/api', () => ({ api: apiMock }))

const ASSET_ID = 'aud_00000000-0000-4000-8000-000000000001'

function untrackedProgress(loadsPosition?: boolean) {
  return useAudioProgress(1, {
    trackingEnabled: false,
    loadsPosition,
    manifestRevision: 'a'.repeat(64),
    assets: [{ assetId: ASSET_ID, durationMs: 20_000 }],
  })
}

describe('useAudioProgress while untracked', () => {
  beforeEach(() => {
    apiMock.mockReset()
    apiMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ assetId: ASSET_ID, positionMs: 12_000, revision: 3 }) })
  })

  it('restores the saved position of a returning peek without writing one', async () => {
    const progress = untrackedProgress(true)

    await progress.load()
    progress.update(ASSET_ID, 15)
    await progress.flush()

    expect(apiMock).toHaveBeenCalledTimes(1)
    expect(progress.loaded.value).toBe(true)
    expect(progress.resumeAssetId.value).toBe(ASSET_ID)
    expect(progress.resumePosition.value).toBe(12)
  })

  it('skips the saved position of a fresh peek', async () => {
    const progress = untrackedProgress()

    await progress.load()

    expect(apiMock).not.toHaveBeenCalled()
    expect(progress.loaded.value).toBe(true)
    expect(progress.resumeAssetId.value).toBeNull()
  })
})
