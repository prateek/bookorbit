import { readonly, ref } from 'vue'

export interface EndPosition {
  /** Scrolled flow has no page to turn past, so reaching the bottom is the request. */
  scrolled?: boolean
}

/**
 * In paginated flow the end-of-chapter card is asked for by a page turn past the last page, not
 * by the last page coming into view, so the last lines can be read before anything covers them.
 * In scrolled flow the card follows the reader to the bottom of the chapter.
 */
export function useEndCardRequest() {
  const requested = ref(false)
  let dismissedAtEnd = false
  let scrolledFlow = false

  /** In scrolled flow a dismissal holds until the reader scrolls away from the bottom, even against a forward turn. */
  function request() {
    if (scrolledFlow && dismissedAtEnd) return
    requested.value = true
  }

  function dismiss() {
    requested.value = false
    dismissedAtEnd = true
  }

  /** Called on every relocate; moving back off the last page withdraws the request. */
  function syncAtEnd(atEnd: boolean, { scrolled = false }: EndPosition = {}) {
    scrolledFlow = scrolled
    if (!atEnd) {
      requested.value = false
      dismissedAtEnd = false
    } else if (scrolled && !dismissedAtEnd) {
      requested.value = true
    }
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
