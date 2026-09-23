import { onMounted, onUnmounted, ref } from 'vue'

const AUTO_HIDE_DELAY_MS = 3000
const CHROME_SELECTOR = '[data-reader-chrome]'

// On a touch screen there is no hover to bring the bars back, so they stay up until the next tap.
function prefersPersistentControls() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}

function isInsideChrome(target: EventTarget | null) {
  return target instanceof Element && target.closest(CHROME_SELECTOR) !== null
}

export function useVisibility() {
  const headerVisible = ref(false)
  const footerVisible = ref(false)
  const isPinned = ref(false)

  let isVisibilityLocked = false
  let isInteractingWithChrome = false
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function clearHideTimer() {
    if (!hideTimer) return
    clearTimeout(hideTimer)
    hideTimer = null
  }

  function scheduleHide() {
    clearHideTimer()
    if (isInteractingWithChrome || prefersPersistentControls()) return
    hideTimer = setTimeout(() => {
      if (!isPinned.value && !isVisibilityLocked) {
        headerVisible.value = false
        footerVisible.value = false
      }
      hideTimer = null
    }, AUTO_HIDE_DELAY_MS)
  }

  function handleMiddleTap() {
    if (isVisibilityLocked) return
    if (isPinned.value) return

    if (headerVisible.value || footerVisible.value) {
      clearHideTimer()
      headerVisible.value = false
      footerVisible.value = false
      return
    }

    headerVisible.value = true
    footerVisible.value = true
    scheduleHide()
  }

  function togglePinned() {
    isPinned.value = !isPinned.value
    headerVisible.value = true
    footerVisible.value = true

    if (isPinned.value) {
      clearHideTimer()
    } else {
      scheduleHide()
    }
  }

  function showHeader() {
    if (isVisibilityLocked) {
      headerVisible.value = true
      return
    }

    if (!isPinned.value) {
      headerVisible.value = true
      scheduleHide()
    }
  }

  function showFooter() {
    if (isVisibilityLocked) {
      footerVisible.value = true
      return
    }

    if (!isPinned.value) {
      footerVisible.value = true
      scheduleHide()
    }
  }

  function hideOverlays(force = false) {
    if (isVisibilityLocked && !force) return

    clearHideTimer()
    isPinned.value = false
    headerVisible.value = false
    footerVisible.value = false
  }

  function setVisibilityLock(locked: boolean) {
    isVisibilityLocked = locked

    clearHideTimer()

    if (locked) {
      headerVisible.value = true
      return
    }

    if (isPinned.value) {
      headerVisible.value = true
      footerVisible.value = true
      return
    }

    headerVisible.value = false
    footerVisible.value = false
  }

  function areControlsTemporarilyVisible() {
    return !isPinned.value && !isVisibilityLocked && (headerVisible.value || footerVisible.value)
  }

  function handleChromePointerDown(event: Event) {
    if (!isInsideChrome(event.target)) return
    isInteractingWithChrome = true
    clearHideTimer()
  }

  function handleChromePointerUp() {
    if (!isInteractingWithChrome) return
    isInteractingWithChrome = false
    if (areControlsTemporarilyVisible()) scheduleHide()
  }

  function handleChromeActivity(event: Event) {
    if (isInteractingWithChrome || !isInsideChrome(event.target)) return
    if (areControlsTemporarilyVisible()) scheduleHide()
  }

  onMounted(() => {
    document.addEventListener('pointerdown', handleChromePointerDown, true)
    document.addEventListener('pointerup', handleChromePointerUp, true)
    document.addEventListener('pointercancel', handleChromePointerUp, true)
    document.addEventListener('input', handleChromeActivity, true)
    document.addEventListener('keydown', handleChromeActivity, true)
  })

  onUnmounted(() => {
    clearHideTimer()
    document.removeEventListener('pointerdown', handleChromePointerDown, true)
    document.removeEventListener('pointerup', handleChromePointerUp, true)
    document.removeEventListener('pointercancel', handleChromePointerUp, true)
    document.removeEventListener('input', handleChromeActivity, true)
    document.removeEventListener('keydown', handleChromeActivity, true)
  })

  return { headerVisible, footerVisible, isPinned, handleMiddleTap, togglePinned, showHeader, showFooter, hideOverlays, setVisibilityLock }
}
