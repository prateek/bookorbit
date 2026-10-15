import { afterEach, describe, expect, it } from 'vitest'
import { sidebarHandedOffPinned, sidebarHandoffState } from '../sidebar-handoff'

describe('sidebar handoff', () => {
  afterEach(() => {
    window.history.replaceState(null, '')
  })

  it('carries only a sidebar that is open and pinned', () => {
    expect(sidebarHandoffState(true, true)).toEqual({ readerSidebar: 'pinned' })
    expect(sidebarHandoffState(true, false)).toEqual({})
    expect(sidebarHandoffState(false, true)).toEqual({})
  })

  it('reads the pinned sidebar back from the history entry it was written to', () => {
    window.history.replaceState({ readerEnteredBookId: 3, ...sidebarHandoffState(true, true) }, '')
    expect(sidebarHandedOffPinned()).toBe(true)
  })

  it('opens no sidebar without a handoff', () => {
    window.history.replaceState({ readerEnteredBookId: 3 }, '')
    expect(sidebarHandedOffPinned()).toBe(false)

    window.history.replaceState(null, '')
    expect(sidebarHandedOffPinned()).toBe(false)
  })
})
