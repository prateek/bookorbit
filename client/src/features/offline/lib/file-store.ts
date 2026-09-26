/**
 * Where downloaded book files live. Writes are positional so a resumed download can continue at
 * the byte it reached, and a write is only durable once `flush` resolves.
 */
export interface BookFileStore {
  write(key: string, offset: number, data: Uint8Array): Promise<void>
  flush(key: string): Promise<void>
  /** Cuts the file to `size` bytes, creating it empty when it does not exist yet. */
  truncate(key: string, size: number): Promise<void>
  close(key: string): Promise<void>
  read(key: string): Promise<Blob | null>
  size(key: string): Promise<number>
  remove(key: string): Promise<void>
}

const ROOT_DIRECTORY = 'bookorbit-books'

export function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function' && typeof Worker !== 'undefined'
}

type WorkerRequest =
  | { op: 'write'; path: string[]; offset: number; data: Uint8Array }
  | { op: 'flush' | 'close'; path: string[] }
  | { op: 'truncate'; path: string[]; size: number }

type WorkerReply = { id: number; ok: true } | { id: number; ok: false; name: string; message: string }

/**
 * OPFS, written from a worker through sync access handles: the one OPFS write path Safari has had
 * since 16.4. Reads use `getFile()` on the main thread, which every OPFS browser supports.
 */
export class OpfsBookFileStore implements BookFileStore {
  private worker: Worker | null = null
  private nextId = 1
  private readonly pending = new Map<number, { resolve: () => void; reject: (error: unknown) => void }>()

  constructor(private readonly userId: number) {}

  write(key: string, offset: number, data: Uint8Array): Promise<void> {
    return this.call({ op: 'write', path: this.path(key), offset, data }, [data.buffer as ArrayBuffer])
  }

  flush(key: string): Promise<void> {
    return this.call({ op: 'flush', path: this.path(key) })
  }

  truncate(key: string, size: number): Promise<void> {
    return this.call({ op: 'truncate', path: this.path(key), size })
  }

  close(key: string): Promise<void> {
    return this.call({ op: 'close', path: this.path(key) })
  }

  async read(key: string): Promise<Blob | null> {
    const handle = await this.fileHandle(key, false)
    return handle ? handle.getFile() : null
  }

  async size(key: string): Promise<number> {
    return (await this.read(key))?.size ?? 0
  }

  async remove(key: string): Promise<void> {
    await this.close(key).catch(() => undefined)
    const directory = await this.directory(false)
    await directory?.removeEntry(key).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
    })
  }

  private path(key: string): string[] {
    return [ROOT_DIRECTORY, `user-${this.userId}`, key]
  }

  private async directory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
    try {
      const root = await navigator.storage.getDirectory()
      const books = await root.getDirectoryHandle(ROOT_DIRECTORY, { create })
      return await books.getDirectoryHandle(`user-${this.userId}`, { create })
    } catch (error) {
      if (!create && error instanceof DOMException && error.name === 'NotFoundError') return null
      throw error
    }
  }

  private async fileHandle(key: string, create: boolean): Promise<FileSystemFileHandle | null> {
    const directory = await this.directory(create)
    if (!directory) return null
    try {
      return await directory.getFileHandle(key, { create })
    } catch (error) {
      if (!create && error instanceof DOMException && error.name === 'NotFoundError') return null
      throw error
    }
  }

  private call(request: WorkerRequest, transfer: Transferable[] = []): Promise<void> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      worker.postMessage({ id, ...request }, transfer)
    })
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./opfs-writer.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data
      const waiter = this.pending.get(reply.id)
      if (!waiter) return
      this.pending.delete(reply.id)
      if (reply.ok) waiter.resolve()
      else waiter.reject(new DOMException(reply.message, reply.name))
    }
    worker.onerror = (event) => {
      for (const waiter of this.pending.values()) waiter.reject(new DOMException(event.message || 'Storage worker failed', 'UnknownError'))
      this.pending.clear()
      this.worker = null
    }
    this.worker = worker
    return worker
  }
}

/** For tests and browsers without OPFS: nothing survives a reload. */
export class MemoryBookFileStore implements BookFileStore {
  readonly files = new Map<string, Uint8Array>()
  /** Total bytes the store accepts before failing like a full disk. */
  capacity = Number.POSITIVE_INFINITY

  /** Detaches `data` afterwards, as the OPFS store's transfer to its worker does. */
  async write(key: string, offset: number, data: Uint8Array): Promise<void> {
    const current = this.files.get(key) ?? new Uint8Array(0)
    const length = Math.max(current.length, offset + data.length)
    if (this.used() - current.length + length > this.capacity) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    const next = new Uint8Array(length)
    next.set(current)
    next.set(data, offset)
    this.files.set(key, next)
    structuredClone(data.buffer, { transfer: [data.buffer as ArrayBuffer] })
  }

  async flush(): Promise<void> {}

  async truncate(key: string, size: number): Promise<void> {
    const current = this.files.get(key) ?? new Uint8Array(0)
    const next = new Uint8Array(size)
    next.set(current.subarray(0, size))
    this.files.set(key, next)
  }

  async close(): Promise<void> {}

  async read(key: string): Promise<Blob | null> {
    const data = this.files.get(key)
    return data ? new Blob([data as BlobPart]) : null
  }

  async size(key: string): Promise<number> {
    return this.files.get(key)?.length ?? 0
  }

  async remove(key: string): Promise<void> {
    this.files.delete(key)
  }

  private used(): number {
    let total = 0
    for (const data of this.files.values()) total += data.length
    return total
  }
}
