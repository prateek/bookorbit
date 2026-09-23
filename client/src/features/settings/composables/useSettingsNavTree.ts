import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { useSettingsNavStatus } from './useSettingsNavStatus'
import { visibleSettingsNav, type SettingsNavGroup, type SettingsNavItem } from '../lib/settings-nav'

export interface SettingsNavSearchHit {
  item: SettingsNavItem
  group: SettingsNavGroup
  rank: number
}

export interface SettingsNavTreeOptions {
  /**
   * The sidebar treats a grouping row as a shortcut to its first page. The phone index only
   * discloses the children, so reading the list never navigates away from it.
   */
  openNavigates: boolean
}

/** The settings tree as the current user may see it, with branch disclosure and search. */
export function useSettingsNavTree({ openNavigates }: SettingsNavTreeOptions) {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const { isSuperuser, userPermissions, isDemoRestrictedAccount } = usePermissions()

  const groups = computed(() =>
    visibleSettingsNav({
      isSuperuser: isSuperuser.value,
      permissions: userPermissions.value,
      isDemoRestricted: isDemoRestrictedAccount.value,
    }),
  )

  const showsLibraryScan = computed(() => groups.value.some((group) => group.items.some((item) => item.status === 'libraryScan')))
  const { isLibraryScanning } = useSettingsNavStatus(showsLibraryScan)

  const activeRouteName = computed(() => (typeof route.name === 'string' ? route.name : ''))

  function isActive(item: SettingsNavItem): boolean {
    return item.routeName === activeRouteName.value
  }

  function isBranchActive(item: SettingsNavItem): boolean {
    if (isActive(item)) return true
    return item.children?.some(isActive) ?? false
  }

  /**
   * Which branch is open. `null` follows the route, so a deep link or a reload lands with the
   * relevant branch already expanded; a string pins one open and `''` closes them all. Toggling
   * writes here, and navigating hands control back to the route.
   */
  const openBranch = ref<string | null>(null)

  watch(activeRouteName, () => {
    openBranch.value = null
  })

  function isBranchOpen(item: SettingsNavItem): boolean {
    if (!item.children?.length) return false
    return openBranch.value === null ? isBranchActive(item) : openBranch.value === item.id
  }

  /** A parent row opens its first child, since parents are groupings rather than pages. */
  function branchTarget(item: SettingsNavItem): string {
    return item.children?.[0]?.routeName ?? item.routeName
  }

  /** Opening a grouping row jumps to its first page (when navigating); closing it leaves you where you are. */
  function toggleBranch(item: SettingsNavItem): void {
    if (isBranchOpen(item)) {
      openBranch.value = ''
      return
    }
    openBranch.value = item.id
    if (!openNavigates) return
    const target = branchTarget(item)
    if (target !== activeRouteName.value) void router.push({ name: target })
  }

  const query = ref('')

  function searchText(item: SettingsNavItem, group: SettingsNavGroup): string {
    const description = item.descriptionKey ? t(item.descriptionKey) : ''
    return `${t(item.labelKey)} ${description} ${item.keywords ?? ''} ${t(group.labelKey)}`.toLowerCase()
  }

  /** Leaf destinations only: a parent with children is never a navigation target on its own. */
  const searchableItems = computed<{ item: SettingsNavItem; group: SettingsNavGroup }[]>(() =>
    groups.value.flatMap((group) =>
      group.items.flatMap((item) => (item.children?.length ? item.children.map((child) => ({ item: child, group })) : [{ item, group }])),
    ),
  )

  const results = computed<SettingsNavSearchHit[]>(() => {
    const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []
    return searchableItems.value
      .map(({ item, group }) => {
        const haystack = searchText(item, group)
        if (!terms.every((term) => haystack.includes(term))) return null
        const label = t(item.labelKey).toLowerCase()
        const lead = terms[0] ?? ''
        const rank = label.startsWith(lead) ? 0 : label.includes(lead) ? 1 : 2
        return { item, group, rank }
      })
      .filter((hit): hit is SettingsNavSearchHit => hit !== null)
      .sort((a, b) => a.rank - b.rank)
  })

  const isSearching = computed(() => query.value.trim().length > 0)

  return { groups, isLibraryScanning, isActive, isBranchActive, isBranchOpen, toggleBranch, query, results, isSearching }
}
