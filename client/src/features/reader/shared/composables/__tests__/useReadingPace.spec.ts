import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const user = ref<{ id: number } | null>({ id: 7 })
vi.mock('@/features/auth/composables/useAuth', () => ({ useAuth: () => ({ user }) }))

const { useReadingPace } = await import('../useReadingPace')

// foliate reports minutes left at 1,600 bytes a minute, so bytes left = minutes * 1600.
const bytes = (minutes: number) => minutes / 1600

function clock() {
  let at = 1_000_000
  return {
    now: () => at,
    advance(ms: number) {
      at += ms
    },
  }
}

/** Reads `count` stretches of 30 seconds at `bytesPerMinute`, starting `left` bytes from the end. */
function read(pace: ReturnType<typeof useReadingPace>, time: ReturnType<typeof clock>, bytesPerMinute: number, count: number, left = 1_000_000) {
  pace.record(bytes(left))
  for (let i = 0; i < count; i++) {
    time.advance(30_000)
    left -= bytesPerMinute / 2
    pace.record(bytes(left))
  }
  return left
}

beforeEach(() => {
  localStorage.clear()
  user.value = { id: 7 }
})

describe('useReadingPace', () => {
  it('keeps foliate’s estimate until there is enough reading to go on', () => {
    const time = clock()
    const pace = useReadingPace(time.now)
    read(pace, time, 800, 9)

    expect(pace.bytesPerMinute.value).toBeNull()
    expect(pace.minutesAtPace(10)).toBe(10)
  })

  it('rescales time left to the measured pace', () => {
    const time = clock()
    const pace = useReadingPace(time.now)
    read(pace, time, 800, 12)

    expect(pace.bytesPerMinute.value).toBe(800)
    expect(pace.minutesAtPace(10)).toBe(20)
  })

  it('remembers the pace for the next book on this device', () => {
    const time = clock()
    read(useReadingPace(time.now), time, 3200, 12)

    expect(useReadingPace(time.now).minutesAtPace(10)).toBe(5)
  })

  it('ignores time away from the book, jumps and moving backwards', () => {
    const time = clock()
    const pace = useReadingPace(time.now)
    let left = read(pace, time, 1000, 12)

    time.advance(20 * 60_000)
    left -= 500
    pace.record(bytes(left))
    time.advance(30_000)
    left -= 400_000
    pace.record(bytes(left))
    time.advance(30_000)
    pace.record(bytes(left + 50_000))

    expect(pace.bytesPerMinute.value).toBe(1000)
  })

  it('treats unreadable stored samples as none', () => {
    localStorage.setItem('reader:pace:7', '{"not":"a list"}')
    expect(useReadingPace().bytesPerMinute.value).toBeNull()
  })

  it('keeps each user’s pace apart on a shared browser', () => {
    const time = clock()
    read(useReadingPace(time.now), time, 3200, 12)

    user.value = { id: 8 }
    expect(useReadingPace(time.now).bytesPerMinute.value).toBeNull()
  })
})
