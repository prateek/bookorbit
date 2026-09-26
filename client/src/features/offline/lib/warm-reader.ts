/**
 * Loads what the reader needs so a downloaded book opens in airplane mode. Fetching through the
 * page puts each response in the service worker's runtime caches: the foliate engine (network
 * first, so an update still arrives when online) and the PDF engine's WebAssembly. The reader's
 * own code is precached with the app.
 */
const warmed = new Set<string>()

export async function warmReaderEngine(format: string): Promise<void> {
  const engine = format === 'pdf' ? 'pdf' : 'epub'
  if (warmed.has(engine)) return
  warmed.add(engine)
  const tasks: Array<Promise<unknown>> = [import('@/features/reader/ReaderView.vue')]
  if (format === 'pdf') {
    tasks.push(
      import('@/features/reader/pdf-v4/PdfV4ReaderView.vue'),
      import('@embedpdf/pdfium/pdfium.wasm?url').then((wasm) => fetch(wasm.default)),
    )
  } else {
    tasks.push(...__FOLIATE_ASSETS__.map((url) => fetch(url)))
  }
  await Promise.allSettled(tasks)
}
