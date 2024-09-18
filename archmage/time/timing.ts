export function debounceCallback<T extends (...args: void[]) => void>(
  func: T,
  wait: number
): { triggerDebounce: () => void; cancelDebounce: () => void } {
  let timeout: NodeJS.Timeout

  const cancelDebounce = (): void => {
    clearTimeout(timeout)
  }

  return {
    triggerDebounce: (): void => {
      clearTimeout(timeout)
      timeout = setTimeout(func, wait)
    },
    cancelDebounce
  }
}
