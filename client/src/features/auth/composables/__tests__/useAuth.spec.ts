import { beforeEach, describe, expect, it, vi } from 'vitest'

type VoidFn = () => void

const routerPushMock = vi.hoisted(() => vi.fn<(to: string) => void>())
const routerReplaceMock = vi.hoisted(() => vi.fn<(to: unknown) => Promise<void>>())
const currentRoute = vi.hoisted(() => ({
  value: { query: {} as Record<string, unknown>, matched: [{}], meta: {} as Record<string, unknown>, fullPath: '/' },
}))
const setAccessTokenMock = vi.hoisted(() => vi.fn<(token: string | null) => void>())
const setOnAuthFailureMock = vi.hoisted(() => vi.fn<(fn: VoidFn) => void>())
const refreshAccessTokenMock = vi.hoisted(() => vi.fn<() => Promise<string>>())
const apiMock = vi.hoisted(() => vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>())
const resetLibrariesMock = vi.hoisted(() => vi.fn<VoidFn>())
const resetSmartScopesMock = vi.hoisted(() => vi.fn<VoidFn>())
const resetCollectionsMock = vi.hoisted(() => vi.fn<VoidFn>())
const resetWhatsNewMock = vi.hoisted(() => vi.fn<VoidFn>())
const cancelPendingThemeSyncMock = vi.hoisted(() => vi.fn<VoidFn>())
const cancelPendingDisplaySettingsSyncMock = vi.hoisted(() => vi.fn<VoidFn>())
const disconnectAuthorEnrichmentSocketMock = vi.hoisted(() => vi.fn<VoidFn>())
const disconnectBookMetadataFetchSocketMock = vi.hoisted(() => vi.fn<VoidFn>())

vi.mock('@/router', () => ({
  default: {
    push: routerPushMock,
    replace: routerReplaceMock,
    currentRoute,
  },
}))

vi.mock('@/lib/api', () => {
  class NetworkError extends Error {}
  class ServerUnavailableError extends Error {}
  return {
    api: apiMock,
    NetworkError,
    ServerUnavailableError,
    isServerUnavailableStatus: (status: number) => status >= 502 && status <= 504,
    isServerUnreachable: (reason: unknown) => reason instanceof NetworkError || reason instanceof ServerUnavailableError,
    refreshAccessToken: refreshAccessTokenMock,
    setAccessToken: setAccessTokenMock,
    setOnAuthFailure: setOnAuthFailureMock,
  }
})

vi.mock('@/composables/useLocaleSync', () => ({
  cancelPendingLocaleSync: vi.fn<VoidFn>(),
  hydrateLocalePreference: vi.fn<() => Promise<void>>(),
  initLocaleSync: vi.fn<VoidFn>(),
}))

vi.mock('@/composables/useThemeSync', () => ({
  cancelPendingThemeSync: cancelPendingThemeSyncMock,
  initThemeSync: vi.fn<VoidFn>(),
  loadFromServer: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/composables/useDisplaySettingsSync', () => ({
  cancelPendingDisplaySettingsSync: cancelPendingDisplaySettingsSyncMock,
  initDisplaySettingsSync: vi.fn<VoidFn>(),
  loadDisplaySettingsFromServer: vi.fn<() => Promise<void>>(),
}))

vi.mock('../useSetupStatus', () => ({
  useSetupStatus: () => ({
    needsSetup: { value: false },
  }),
}))

vi.mock('@/features/settings/composables/useAuthorEnrichmentStatus', () => ({
  disconnectAuthorEnrichmentSocket: disconnectAuthorEnrichmentSocketMock,
}))

vi.mock('@/features/book-metadata-fetch/composables/useBookMetadataFetchStatus', () => ({
  disconnectBookMetadataFetchSocket: disconnectBookMetadataFetchSocketMock,
}))

vi.mock('@/features/whats-new/composables/useWhatsNew', () => ({
  resetWhatsNew: resetWhatsNewMock,
}))

vi.mock('@/features/library/composables/useLibraries', () => ({
  resetLibraries: resetLibrariesMock,
}))

vi.mock('@/features/smart-scope/composables/useSmartScopes', () => ({
  resetSmartScopes: resetSmartScopesMock,
}))

vi.mock('@/features/collection/composables/useCollections', () => ({
  resetCollections: resetCollectionsMock,
}))

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetModules()
    routerPushMock.mockReset()
    routerReplaceMock.mockReset()
    routerReplaceMock.mockResolvedValue(undefined)
    currentRoute.value = { query: {}, matched: [{}], meta: {}, fullPath: '/' }
    setAccessTokenMock.mockReset()
    setOnAuthFailureMock.mockReset()
    refreshAccessTokenMock.mockReset()
    apiMock.mockReset()
    resetLibrariesMock.mockReset()
    resetSmartScopesMock.mockReset()
    resetCollectionsMock.mockReset()
    resetWhatsNewMock.mockReset()
    cancelPendingThemeSyncMock.mockReset()
    cancelPendingDisplaySettingsSyncMock.mockReset()
    disconnectAuthorEnrichmentSocketMock.mockReset()
    disconnectBookMetadataFetchSocketMock.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response),
    )
  })

  it('carries the lockout code and retry window off a rejected login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'Account temporarily locked', errorCode: 'account_locked', retryAfterSeconds: 540 }),
      } as Response),
    )
    const { useAuth, LoginError } = await import('../useAuth')

    const error = await useAuth()
      .login('ada', 'correct-horse')
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(LoginError)
    expect((error as InstanceType<typeof LoginError>).errorCode).toBe('account_locked')
    expect((error as InstanceType<typeof LoginError>).retryAfterSeconds).toBe(540)
  })

  it('clears user-scoped sidebar caches on logout', async () => {
    const { useAuth } = await import('../useAuth')

    await useAuth().logout()

    expect(resetLibrariesMock).toHaveBeenCalledTimes(1)
    expect(resetSmartScopesMock).toHaveBeenCalledTimes(1)
    expect(resetCollectionsMock).toHaveBeenCalledTimes(1)
    expect(setAccessTokenMock).toHaveBeenCalledWith(null)
    expect(routerPushMock).toHaveBeenCalledWith('/login')
  })
  it('finishes local sign-out when the server is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network unavailable')))
    const { useAuth } = await import('../useAuth')
    await expect(useAuth().logout()).resolves.toBeUndefined()
    expect(setAccessTokenMock).toHaveBeenCalledWith(null)
    expect(routerPushMock).toHaveBeenCalledWith('/login')
  })

  it('uses the local login route after successful logout', async () => {
    const readBody = vi.fn<() => unknown>()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: readBody } as unknown as Response))
    const { useAuth } = await import('../useAuth')
    await useAuth().logout()
    expect(readBody).not.toHaveBeenCalled()
    expect(routerPushMock).toHaveBeenCalledWith('/login')
  })

  it('sends a protected page to sign-in when the session is rejected', async () => {
    await import('../useAuth')
    const onAuthFailure = setOnAuthFailureMock.mock.calls[0]![0]

    onAuthFailure()

    expect(setAccessTokenMock).toHaveBeenCalledWith(null)
    expect(routerReplaceMock).toHaveBeenCalledWith({ path: '/login' })
  })

  it('stays on a public page when the session is rejected', async () => {
    currentRoute.value = { query: {}, matched: [{}], meta: { public: true }, fullPath: '/reset-password' }
    await import('../useAuth')
    const onAuthFailure = setOnAuthFailureMock.mock.calls[0]![0]

    onAuthFailure()

    expect(setAccessTokenMock).toHaveBeenCalledWith(null)
    expect(routerReplaceMock).not.toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('replaces the login page with the requested chapter after signing in', async () => {
    currentRoute.value = { query: { redirect: '/read/1159/1159?format=epub' }, matched: [{}], meta: { public: true }, fullPath: '/login' }
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ accessToken: 't', user: { isDefaultPassword: false } }) } as Response),
    )
    apiMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ isDefaultPassword: false, settings: {} }) } as Response)
    const { useAuth } = await import('../useAuth')

    await useAuth().login('ada', 'correct-horse')

    expect(routerReplaceMock).toHaveBeenCalledWith('/read/1159/1159?format=epub')
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('ignores a redirect that would leave the app', async () => {
    currentRoute.value = { query: { redirect: '//evil.example/path' }, matched: [{}], meta: { public: true }, fullPath: '/login' }
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ accessToken: 't', user: { isDefaultPassword: false } }) } as Response),
    )
    apiMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ isDefaultPassword: false, settings: {} }) } as Response)
    const { useAuth } = await import('../useAuth')

    await useAuth().login('ada', 'correct-horse')

    expect(routerReplaceMock).toHaveBeenCalledWith('/')
  })

  it('keeps the page the user was on when the session is rejected', async () => {
    currentRoute.value = { query: { format: 'epub' }, matched: [{}], meta: {}, fullPath: '/read/1159/1159?format=epub' }
    await import('../useAuth')
    const onAuthFailure = setOnAuthFailureMock.mock.calls[0]![0]

    onAuthFailure()

    expect(setAccessTokenMock).toHaveBeenCalledWith(null)
    expect(routerReplaceMock).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/read/1159/1159?format=epub' } })
  })

  it('reports the session as unavailable, not signed out, when the server cannot be reached', async () => {
    const { NetworkError } = await import('@/lib/api')
    refreshAccessTokenMock.mockRejectedValue(new NetworkError('Load failed'))
    const { useAuth } = await import('../useAuth')
    const auth = useAuth()

    await auth.init()

    expect(auth.user.value).toBeNull()
    expect(auth.sessionUnavailable.value).toBe(true)
  })

  it('treats a rejected refresh as signed out', async () => {
    refreshAccessTokenMock.mockRejectedValue(new Error('refresh failed'))
    const { useAuth } = await import('../useAuth')
    const auth = useAuth()

    await auth.init()

    expect(auth.sessionUnavailable.value).toBe(false)
  })
})
