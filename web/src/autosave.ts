export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

/**
 * Lưu có debounce. Lỗi thì báo `error` và thử lại sau `retryMs` cho đến khi được.
 * `getData` được gọi lúc lưu (không phải lúc schedule) để luôn lưu bản mới nhất.
 */
export function createAutosaver<T>(opts: {
  save: (data: T) => Promise<unknown>
  delayMs: number
  retryMs: number
  onStatus: (s: SaveStatus) => void
}) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let getData: (() => T) | undefined
  let saving = false
  let again = false

  const run = async () => {
    timer = undefined
    if (!getData) return
    if (saving) {
      again = true
      return
    }
    const read = getData
    getData = undefined
    saving = true
    opts.onStatus('saving')
    try {
      await opts.save(read())
      opts.onStatus(getData ? 'pending' : 'saved')
    } catch {
      getData ??= read
      opts.onStatus('error')
      timer = setTimeout(run, opts.retryMs)
    } finally {
      saving = false
      if (again) {
        again = false
        if (getData && !timer) timer = setTimeout(run, opts.delayMs)
      }
    }
  }

  return {
    schedule(read: () => T) {
      getData = read
      opts.onStatus('pending')
      clearTimeout(timer)
      timer = setTimeout(run, opts.delayMs)
    },
    /** Lưu ngay phần đang chờ (ví dụ khi đóng tab). */
    flush() {
      if (!getData) return
      clearTimeout(timer)
      void run()
    },
    dispose() {
      clearTimeout(timer)
    },
  }
}
