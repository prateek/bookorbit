/// <reference types="vite/client" />

import 'vue-router'
import type { Permission } from '@bookorbit/types'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    requiredPermission?: Permission
    forbiddenPermission?: Permission
    permissionFallback?: string
    maxWidth?: string
    title?: string | ((to: RouteLocationNormalizedLoaded) => string)
    /** Renders from local data, so it stays reachable when the app launched without the server. */
    offlineCapable?: boolean
  }
}

declare global {
  /** Every file of the foliate reader engine under `/assets/foliate/`, listed at build time. */
  const __FOLIATE_ASSETS__: string[]
}
