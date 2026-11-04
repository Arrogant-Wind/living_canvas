import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosaver, type SaveStatus } from '../src/autosave'

describe('createAutosaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces changes into one save', async () => {
    const save = vi.fn(async () => {})
    const a = createAutosaver({ save, delayMs: 800, retryMs: 5000, onStatus: () => {} })
    a.schedule(() => 1)
    a.schedule(() => 2)
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(2)
  })

  it('reports an error and retries until the save succeeds', async () => {
    const statuses: SaveStatus[] = []
    let fail = true
    const save = vi.fn(async () => {
      if (fail) throw new Error('down')
    })
    const a = createAutosaver({ save, delayMs: 800, retryMs: 5000, onStatus: (s) => statuses.push(s) })
    a.schedule(() => 'x')
    await vi.advanceTimersByTimeAsync(800)
    expect(statuses.at(-1)).toBe('error')
    fail = false
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(statuses.at(-1)).toBe('saved')
  })

  it('flush saves a pending change immediately', async () => {
    const save = vi.fn(async () => {})
    const a = createAutosaver({ save, delayMs: 800, retryMs: 5000, onStatus: () => {} })
    a.schedule(() => 'y')
    a.flush()
    expect(save).toHaveBeenCalledWith('y')
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(1)
  })
})
