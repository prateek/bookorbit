import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { BarChart3, Settings, Sparkles, Trophy, UserRound } from '@lucide/vue'

export interface YouEntry {
  id: 'settings' | 'statistics' | 'achievements' | 'whats-new' | 'account'
  labelKey: string
  icon: Component
  to: RouteLocationRaw
  isActive: boolean
  hasDot: boolean
}

export interface YouEntryContext {
  routeName: string
  achievementsEnabled: boolean
  hasUnseenWhatsNew: boolean
}

function isAccountRoute(routeName: string): boolean {
  return routeName.startsWith('settings-account') || routeName === 'settings-notifications'
}

/** Personal destinations that phones otherwise only reach through the header's overflow menu. */
export function buildYouEntries({ routeName, achievementsEnabled, hasUnseenWhatsNew }: YouEntryContext): YouEntry[] {
  const entries: YouEntry[] = [
    {
      id: 'settings',
      labelKey: 'components.appHeader.settings',
      icon: Settings,
      to: { name: 'settings-home' },
      isActive: routeName.startsWith('settings-') && !isAccountRoute(routeName),
      hasDot: false,
    },
    {
      id: 'statistics',
      labelKey: 'components.appHeader.statistics',
      icon: BarChart3,
      to: { name: 'statistics', query: { tab: 'library' } },
      isActive: routeName === 'statistics',
      hasDot: false,
    },
    {
      id: 'achievements',
      labelKey: 'components.appHeader.achievements',
      icon: Trophy,
      to: { name: 'achievements' },
      isActive: routeName === 'achievements',
      hasDot: false,
    },
    {
      id: 'whats-new',
      labelKey: 'components.appHeader.whatsNew',
      icon: Sparkles,
      to: { name: 'whats-new' },
      isActive: routeName === 'whats-new',
      hasDot: hasUnseenWhatsNew,
    },
    {
      id: 'account',
      labelKey: 'components.appHeader.account',
      icon: UserRound,
      to: { name: 'settings-account-profile' },
      isActive: isAccountRoute(routeName),
      hasDot: false,
    },
  ]
  return achievementsEnabled ? entries : entries.filter((entry) => entry.id !== 'achievements')
}
