import { readonly, ref } from 'vue'

/**
 * The end-of-chapter card is asked for by a page turn past the last page, not by the last page
 * coming into view, so the last lines can be read before anything covers them.
 */
export function useEndCardRequest() {
  const requested = ref(false)

  function request() {
    requested.value = true
  }

  function dismiss() {
    requested.value = false
  }

  /** Called on every relocate; moving back off the last page withdraws the request. */
  function syncAtEnd(atEnd: boolean) {
    if (!atEnd) requested.value = false
  }

  return { requested: readonly(requested), request, dismiss, syncAtEnd }
}

export interface EndCardVisibility {
  requested: boolean
  readerBusy: boolean
  tracking: boolean
  hasNextBook: boolean
}

/** A peek tracks nothing, so its card only exists to offer the next chapter. */
export function isEndCardVisible({ requested, readerBusy, tracking, hasNextBook }: EndCardVisibility): boolean {
  return requested && !readerBusy && (tracking || hasNextBook)
}
