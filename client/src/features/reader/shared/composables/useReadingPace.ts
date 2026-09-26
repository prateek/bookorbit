import { computed, ref } from 'vue'
import { useAuth } from '@/features/auth/composables/useAuth'

// foliate estimates time left at a fixed 1,600 bytes of the book's markup per minute. The pace
// measured here is in the same unit, so it rescales foliate's estimate without knowing its sizes.
const FOLIATE_BYTES_PER_MINUTE = 1600
const MAX_SAMPLES = 60
const MIN_SAMPLES = 10
// A sample covers at least this much reading, so one quick page flick does not count as a pace.
const SAMPLE_WINDOW_MS = 20_000
// A longer pause between moves is time away from the book, not reading.
const IDLE_GAP_MS = 5 * 60_000
// Outside this range a sample is a skim or a jump rather than reading.
const MIN_BYTES_PER_MINUTE = 300
const MAX_BYTES_PER_MINUTE = 8000

function readSamples(key: string): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) : []
  } catch {
    return []
  }
}

function writeSamples(key: string, samples: number[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(samples))
  } catch {
    // Without storage the pace still applies for this session.
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

/**
 * The reader's own pace on this device, learned from how fast they move through books, so "time
 * left" reflects them rather than an average reader. Until there is enough reading to go on, it
 * leaves foliate's estimate as it is.
 */
export function useReadingPace(now: () => number = Date.now) {
  // Per user, so people sharing a browser each get their own pace.
  const { user } = useAuth()
  const storageKey = `reader:pace:${user.value?.id ?? 'anonymous'}`
  const samples = ref<number[]>(readSamples(storageKey))
  let anchor: { at: number; remaining: number } | null = null
  let lastMoveAt = 0

  const bytesPerMinute = computed(() => (samples.value.length >= MIN_SAMPLES ? median(samples.value) : null))

  /** Records a position, given foliate's minutes left in the book at its fixed pace. */
  function record(foliateMinutesLeftInBook: number): void {
    if (!Number.isFinite(foliateMinutesLeftInBook) || foliateMinutesLeftInBook < 0) return
    const at = now()
    const remaining = foliateMinutesLeftInBook * FOLIATE_BYTES_PER_MINUTE
    const idle = at - lastMoveAt > IDLE_GAP_MS
    lastMoveAt = at
    if (!anchor || idle || remaining > anchor.remaining) {
      anchor = { at, remaining }
      return
    }
    const elapsedMs = at - anchor.at
    if (elapsedMs < SAMPLE_WINDOW_MS) return
    const rate = (anchor.remaining - remaining) / (elapsedMs / 60_000)
    anchor = { at, remaining }
    if (rate < MIN_BYTES_PER_MINUTE || rate > MAX_BYTES_PER_MINUTE) return
    samples.value = [...samples.value, rate].slice(-MAX_SAMPLES)
    writeSamples(storageKey, samples.value)
  }

  /** Converts foliate's estimate at its fixed pace into minutes at the reader's pace. */
  function minutesAtPace(foliateMinutes: number): number {
    return (foliateMinutes * FOLIATE_BYTES_PER_MINUTE) / (bytesPerMinute.value ?? FOLIATE_BYTES_PER_MINUTE)
  }

  return { bytesPerMinute, record, minutesAtPace }
}
