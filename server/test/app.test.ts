import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import type { AskInput, AskResult } from '../src/orchestrator'
import { PiError } from '../src/pi'
import { ProjectStore } from '../src/store'

const setup = (ask: (i: AskInput) => Promise<AskResult>) => {
  const store = new ProjectStore(mkdtempSync(join(tmpdir(), 'lc-')))
  return { app: createApp({ store, ask }), store }
}
const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const graph = { nodes: [{ id: 'n1', title: 'A', status: 'draft' }], edges: [], notes: [] }

describe('API', () => {
  it('round-trips a canvas snapshot with Vietnamese text', async () => {
    const { app } = setup(async () => ({ reply: '', ops: [], dropped: [] }))
    const snapshot = { title: 'Chuẩn hóa thời gian, không gian' }
    expect((await app.request('/api/projects/demo/canvas', json({ snapshot }, 'PUT'))).status).toBe(200)
    const got = await (await app.request('/api/projects/demo/canvas')).json()
    expect(got.snapshot).toEqual(snapshot)
  })

  it('returns null snapshot for a new project', async () => {
    const { app } = setup(async () => ({ reply: '', ops: [], dropped: [] }))
    expect(await (await app.request('/api/projects/moi/canvas')).json()).toEqual({ snapshot: null })
  })

  it('asks the AI and records both chat messages', async () => {
    let seen: AskInput | undefined
    const { app } = setup(async (i) => {
      seen = i
      return { reply: 'Đã xem', ops: [], dropped: [] }
    })
    const res = await app.request('/api/projects/demo/ask', json({ graph, selection: ['n1'], message: '/review' }))
    expect(res.status).toBe(200)
    expect((await res.json()).reply).toBe('Đã xem')
    expect(seen?.selection).toEqual(['n1'])
    const chat = await (await app.request('/api/projects/demo/chat')).json()
    expect(chat.messages.map((m: any) => [m.role, m.text])).toEqual([
      ['user', '/review'],
      ['ai', 'Đã xem'],
    ])
  })

  it('passes earlier chat as history', async () => {
    const histories: number[] = []
    const { app } = setup(async (i) => {
      histories.push(i.history.length)
      return { reply: 'ok', ops: [], dropped: [] }
    })
    await app.request('/api/projects/demo/ask', json({ graph, selection: [], message: 'a' }))
    await app.request('/api/projects/demo/ask', json({ graph, selection: [], message: 'b' }))
    expect(histories).toEqual([0, 2])
  })

  it('maps a missing pi binary to a 502 with a readable error', async () => {
    const { app } = setup(async () => {
      throw new PiError('not_found', 'Không tìm thấy lệnh "pi"')
    })
    const res = await app.request('/api/projects/demo/ask', json({ graph, selection: [], message: 'x' }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('pi')
  })

  it('rejects unsafe project names', async () => {
    const { app } = setup(async () => ({ reply: '', ops: [], dropped: [] }))
    expect((await app.request('/api/projects/..%2Fx/canvas')).status).toBe(400)
    expect((await app.request('/api/projects/Bad_Name/canvas')).status).toBe(400)
  })

  it('rejects a malformed graph with 400', async () => {
    const { app } = setup(async () => ({ reply: '', ops: [], dropped: [] }))
    const res = await app.request('/api/projects/demo/ask', json({ graph: { nodes: 1 }, message: 'x' }))
    expect(res.status).toBe(400)
  })
})
