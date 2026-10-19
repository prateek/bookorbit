export async function flushProgressBeforeNavigation(flush: () => Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve()
        .then(flush)
        .catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 750)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
