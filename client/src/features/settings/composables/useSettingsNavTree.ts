import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { useBookRequestVisibility } from '@/features/book-requests/composables/useBookRequestVisibility'
import { useSettingsNavStatus } from './useSettingsNavStatus'
import { searchSettingsNav, visibleSettingsNav, type SettingsNavItem } from '../lib/settings-nav'

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
  const { showBookRequests } = useBookRequestVisibility()

  const groups = computed(() =>
    visibleSettingsNav({
      isSuperuser: isSuperuser.value,
      permissions: userPermissions.value,
      isDemoRestricted: isDemoRestrictedAccount.value,
      showBookRequests: showBookRequests.value,
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

  const results = computed(() => searchSettingsNav(groups.value, query.value, t))

  const isSearching = computed(() => query.value.trim().length > 0)

  return { groups, isLibraryScanning, isActive, isBranchActive, isBranchOpen, toggleBranch, query, results, isSearching }
}
