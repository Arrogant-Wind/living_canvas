import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PiError, parsePiJsonl, runPi, type Spawner } from '../src/pi'

const fixture = readFileSync(new URL('./fixtures/pi-ok.jsonl', import.meta.url), 'utf8')

const fake =
  (r: Partial<Awaited<ReturnType<Spawner>>>, seen?: { args?: string[] }): Spawner =>
  async (_bin, args) => {
    if (seen) seen.args = args
    return { code: 0, stdout: '', stderr: '', timedOut: false, notFound: false, ...r }
  }

describe('parsePiJsonl', () => {
  it('returns the final assistant text without thinking', () => {
    expect(parsePiJsonl(fixture)).toBe('{"ok":true}')
  })

  it('throws no_answer when there is no assistant message', () => {
    expect(() => parsePiJsonl('{"type":"agent_start"}\n')).toThrow(PiError)
    try {
      parsePiJsonl('')
    } catch (e) {
      expect((e as PiError).kind).toBe('no_answer')
    }
  })
})

describe('runPi', () => {
  it('passes model, system prompt and isolation flags', async () => {
    const seen: { args?: string[] } = {}
    const out = await runPi({ system: 'SYS', prompt: 'P' }, fake({ stdout: fixture }, seen))
    expect(out).toBe('{"ok":true}')
    const a = seen.args!
    expect(a).toContain('--no-tools')
    expect(a).toContain('--no-session')
    expect(a[a.indexOf('--model') + 1]).toBe('fai/Alibaba:DeepSeek-V4.1-Flash')
    expect(a[a.indexOf('--system-prompt') + 1]).toBe('SYS')
    expect(a.at(-1)).toBe('P')
  })

  it.each([
    [{ notFound: true }, 'not_found'],
    [{ timedOut: true }, 'timeout'],
    [{ code: 1, stderr: 'boom' }, 'exit'],
  ] as const)('maps %o to PiError %s', async (r, kind) => {
    const err = await runPi({ system: 's', prompt: 'p' }, fake(r)).catch((e) => e)
    expect(err).toBeInstanceOf(PiError)
    expect(err.kind).toBe(kind)
    if (kind === 'exit') expect(err.message).toContain('boom')
  })
})
