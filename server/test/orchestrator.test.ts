import { graphToText, type Graph } from '@lc/shared'
import { describe, expect, it } from 'vitest'
import { askAi, parseIntent, type AskInput } from '../src/orchestrator'

const graph: Graph = {
  nodes: [
    { id: 'n1', title: 'Tạo map', status: 'draft' },
    { id: 'n2', title: 'Generate bằng API', status: 'draft' },
  ],
  edges: [{ id: 'e1', from: 'n1', to: 'n2', type: 'flow' }],
  notes: [],
}
const input = (message: string): AskInput => ({ graph, selection: ['n2'], history: [], message })

const scripted = (answers: string[]) => {
  const calls: { system: string; prompt: string }[] = []
  const llm = async (system: string, prompt: string) => {
    calls.push({ system, prompt })
    return answers[Math.min(calls.length - 1, answers.length - 1)]
  }
  return { llm, calls }
}

describe('parseIntent', () => {
  it('reads a leading tag', () => {
    expect(parseIntent('/expand bung node này')).toEqual({ intent: 'expand', text: 'bung node này' })
  })
  it('defaults to chat', () => {
    expect(parseIntent('chào')).toEqual({ intent: 'chat', text: 'chào' })
  })
})

describe('askAi', () => {
  it('repairs invalid ops by sending the errors back', async () => {
    const { llm, calls } = scripted([
      '{"reply":"sửa","ops":[{"op":"update_node","id":"zzz","title":"x"}]}',
      '{"reply":"sửa","ops":[{"op":"update_node","id":"n2","title":"Gọi API sinh cảnh"}]}',
    ])
    const r = await askAi(input('đổi tên'), llm)
    expect(calls).toHaveLength(2)
    expect(calls[1].prompt).toContain('zzz')
    expect(r.ops).toEqual([{ op: 'update_node', id: 'n2', title: 'Gọi API sinh cảnh' }])
    expect(r.dropped).toEqual([])
  })

  it('gives up after maxRepairs and returns the raw text', async () => {
    const { llm, calls } = scripted(['không phải json'])
    const r = await askAi(input('chào'), llm)
    expect(calls).toHaveLength(3)
    expect(r.ops).toEqual([])
    expect(r.reply).toBe('không phải json')
  })

  it('keeps valid ops and reports the rest as dropped when repairs run out', async () => {
    const { llm } = scripted([
      '{"reply":"r","ops":[{"op":"update_node","id":"n1","title":"Bản đồ"},{"op":"delete_node","id":"zzz"}]}',
    ])
    const r = await askAi(input('x'), llm)
    expect(r.ops).toEqual([{ op: 'update_node', id: 'n1', title: 'Bản đồ' }])
    expect(r.dropped).toHaveLength(1)
  })

  it('puts the graph text and the selection into the prompt and picks the intent prompt', async () => {
    const { llm, calls } = scripted(['{"reply":"ok","ops":[]}'])
    await askAi(input('/review'), llm)
    expect(calls[0].prompt).toContain(graphToText(graph))
    expect(calls[0].prompt).toMatch(/ĐANG CHỌN[\s\S]*n2/)
    expect(calls[0].system).toContain('REVIEW')
  })
})
