import { onActivated, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  isReturningToHistoryEntry,
  readScrollPosition,
  scrollEntryKey,
  writeScrollPosition,
} from '@/features/book/composables/useScrollRestoreOnActivate'

const SCOPE = 'series-run'

/**
 * Remembers, per history entry, where in a series listing the loaded run of books starts. A saved
 * scroll offset only fits the list it was measured against, and that run can start anywhere once
 * the view jumps to a chapter or loads earlier pages, so coming back has to rebuild the same run.
 *
 * `savedRunStart` is that position when returning to an entry that has one, otherwise null. A
 * fresh visit overwrites whatever an earlier visit to the same history position left behind; a
 * return keeps the saved value until the rebuilt run replaces it, so leaving mid-restore loses
 * nothing.
 */
export function useSeriesRunSlot(firstIndex: Ref<number>) {
  const path = useRoute().path
  let key = scrollEntryKey(SCOPE, path)
  const savedRunStart = isReturningToHistoryEntry() ? readScrollPosition(key) : null

  function save() {
    writeScrollPosition(key, firstIndex.value)
  }

  // A kept-alive view can be shown again on a newer history entry for the same path.
  onActivated(() => {
    const current = scrollEntryKey(SCOPE, path)
    if (current === key) return
    key = current
    save()
  })
  watch(firstIndex, save, { immediate: savedRunStart === null })

  return { savedRunStart }
}
