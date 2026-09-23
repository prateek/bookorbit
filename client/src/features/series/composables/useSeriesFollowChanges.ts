import { onActivated, ref } from 'vue'

const followVersion = ref(0)

export function notifySeriesFollowChanged(): void {
  followVersion.value += 1
}

export function filterUsesSeriesFollowing(filter: unknown): boolean {
  return filter != null && JSON.stringify(filter).includes('"seriesFollowing"')
}

/**
 * Runs `reload` when a KeepAlive view comes back after a series was followed or unfollowed
 * elsewhere, since a cached view otherwise keeps showing the old follow state.
 */
export function onSeriesFollowChangedWhileAway(reload: () => void): void {
  let seenVersion = followVersion.value
  onActivated(() => {
    if (followVersion.value === seenVersion) return
    seenVersion = followVersion.value
    reload()
  })
}
