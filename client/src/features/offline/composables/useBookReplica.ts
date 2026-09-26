import { whenOfflineSession, type OfflineSession } from '../offline-session'

export interface AttachedReplica {
  session: OfflineSession
  detach: () => void
}

/**
 * Hands a reader composable the offline session and calls `reload` whenever this book's records
 * change: a local write, a write from another tab, or server state arriving in a sync. Resolves to
 * null where the browser cannot hold a replica, and the composable keeps using the network directly.
 * The caller owns `detach`; it is called after an await, so no effect scope is current here.
 */
export async function attachBookReplica(
  bookId: number,
  scope: 'annotations' | 'bookmarks' | 'progress',
  reload: (session: OfflineSession) => void | Promise<void>,
): Promise<AttachedReplica | null> {
  const session = await whenOfflineSession()
  if (!session) return null
  const detach = session.replica.subscribe((change) => {
    if (change.scope === scope && change.bookId === bookId) void reload(session)
  })
  return { session, detach }
}
