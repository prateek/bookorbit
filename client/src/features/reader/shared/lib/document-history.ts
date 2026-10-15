let documentStartPosition: number | null = null

function currentPosition(): number | null {
  const position = (window.history.state as { position?: unknown } | null)?.position
  return typeof position === 'number' ? position : null
}

/** Records the router history position this page load started on. Call at startup, before any in-app push. */
export function rememberDocumentStart() {
  documentStartPosition = currentPosition()
}

/**
 * Whether the history entry behind the current one was shown by this page load. Entries before the one
 * the page loaded on, such as the page behind a reloaded reader, belong to an earlier document, so going
 * back to one loads it afresh without the router seeing the step.
 */
export function entryBehindIsInThisDocument(): boolean {
  const position = currentPosition()
  return documentStartPosition !== null && position !== null && position > documentStartPosition
}
