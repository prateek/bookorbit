import { describe, expect, it } from 'vitest'
import { buildYouEntries } from '../you-entries'

const base = { routeName: 'dashboard', achievementsEnabled: true, hasUnseenWhatsNew: false }

describe('buildYouEntries', () => {
  it('lists the personal destinations phones otherwise reach only from the header menu', () => {
    expect(buildYouEntries(base).map((entry) => entry.id)).toEqual(['settings', 'statistics', 'achievements', 'whats-new', 'account'])
  })

  it('opens settings on the settings index rather than a specific page', () => {
    expect(buildYouEntries(base)[0]?.to).toEqual({ name: 'settings-home' })
  })

  it('drops achievements when the user turned them off', () => {
    expect(buildYouEntries({ ...base, achievementsEnabled: false }).map((entry) => entry.id)).not.toContain('achievements')
  })

  it('flags unseen release notes on the What is New row only', () => {
    const entries = buildYouEntries({ ...base, hasUnseenWhatsNew: true })
    expect(entries.filter((entry) => entry.hasDot).map((entry) => entry.id)).toEqual(['whats-new'])
  })

  it('marks account pages as Account and every other settings page as Settings', () => {
    const active = (routeName: string) =>
      buildYouEntries({ ...base, routeName })
        .filter((entry) => entry.isActive)
        .map((entry) => entry.id)

    expect(active('settings-account-profile')).toEqual(['account'])
    expect(active('settings-notifications')).toEqual(['account'])
    expect(active('settings-appearance-theme')).toEqual(['settings'])
    expect(active('settings-home')).toEqual(['settings'])
    expect(active('statistics')).toEqual(['statistics'])
    expect(active('dashboard')).toEqual([])
  })
})
