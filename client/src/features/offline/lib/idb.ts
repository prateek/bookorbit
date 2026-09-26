/** Promise helpers over the raw IndexedDB API, just enough for the offline stores. */

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Settles when the transaction commits; rejects when it aborts, so a failed write is never mistaken for a durable one. */
export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'))
    tx.onerror = () => reject(tx.error)
  })
}

export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, oldVersion: number, tx: IDBTransaction) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion, request.transaction!)
    request.onsuccess = () => {
      const db = request.result
      // Another tab upgrading the schema must not be blocked by this one.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new DOMException('Offline storage is open in an older tab', 'InvalidStateError'))
  })
}

export function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

/**
 * Runs `body` in one transaction and resolves with its result once the transaction commits. Every
 * store the body touches must be listed, and the body must not await anything but requests on this
 * transaction, or IndexedDB commits it early.
 */
export async function inTransaction<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const tx = db.transaction(stores, mode)
  const done = transactionDone(tx)
  let result: T
  try {
    result = await body(tx)
  } catch (error) {
    try {
      tx.abort()
    } catch {
      // Already finished; the rejection below is what matters.
    }
    await done.catch(() => undefined)
    throw error
  }
  await done
  return result
}
