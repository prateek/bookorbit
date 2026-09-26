/// <reference lib="webworker" />

/**
 * Owns the OPFS sync access handles for files being downloaded. A handle is exclusive, so keeping
 * one open per file for the length of a download also stops two tabs writing the same file.
 */

interface SyncAccessHandle {
  write(buffer: ArrayBufferView, options?: { at?: number }): number
  truncate(size: number): void
  flush(): void
  close(): void
}

type Request =
  | { id: number; op: 'write'; path: string[]; offset: number; data: Uint8Array }
  | { id: number; op: 'flush' | 'close'; path: string[] }
  | { id: number; op: 'truncate'; path: string[]; size: number }

const handles = new Map<string, SyncAccessHandle>()

async function open(path: string[]): Promise<SyncAccessHandle> {
  const key = path.join('/')
  const existing = handles.get(key)
  if (existing) return existing
  let directory = await navigator.storage.getDirectory()
  for (const part of path.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true })
  const file = (await directory.getFileHandle(path[path.length - 1]!, { create: true })) as FileSystemFileHandle & {
    createSyncAccessHandle(): Promise<SyncAccessHandle>
  }
  const handle = await file.createSyncAccessHandle()
  handles.set(key, handle)
  return handle
}

async function handle(request: Request): Promise<void> {
  const key = request.path.join('/')
  switch (request.op) {
    case 'write': {
      const access = await open(request.path)
      let written = 0
      while (written < request.data.byteLength) {
        written += access.write(request.data.subarray(written), { at: request.offset + written })
      }
      return
    }
    case 'truncate':
      ;(await open(request.path)).truncate(request.size)
      return
    case 'flush':
      handles.get(key)?.flush()
      return
    case 'close': {
      const access = handles.get(key)
      if (!access) return
      access.flush()
      access.close()
      handles.delete(key)
      return
    }
  }
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data
  handle(request).then(
    () => self.postMessage({ id: request.id, ok: true }),
    (error: unknown) => {
      const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : 'UnknownError'
      const message = error instanceof Error ? error.message : String(error)
      self.postMessage({ id: request.id, ok: false, name, message })
    },
  )
}
