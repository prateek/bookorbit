/**
 * Mirrors the sidebar panel's width at each breakpoint in ReaderSidebar.vue. Pinning is offered
 * from `sm` up, so below that the sidebar keeps overlaying the page as before.
 */
export const PINNED_SIDEBAR_INSET_CLASS = 'sm:pl-[18rem] md:pl-[19.35rem] lg:pl-[20.25rem]'

export function pinnedSidebarInset(sidebarOpen: boolean, sidebarPinned: boolean): string {
  return sidebarOpen && sidebarPinned ? PINNED_SIDEBAR_INSET_CLASS : ''
}
