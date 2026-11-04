import type { Graph, Op } from '@lc/shared'
import { describe, expect, it } from 'vitest'
import { proposalToPartials } from '../src/canvas/applyProposal'

const graph: Graph = {
  nodes: [
    { id: 'n1', title: 'Tạo map', status: 'draft' },
    { id: 'n2', title: 'Generate bằng API', status: 'draft' },
  ],
  edges: [{ id: 'e1', from: 'n1', to: 'n2', type: 'flow' }],
  notes: [],
}
const boxes = { n1: { x: 0, y: 0, w: 200, h: 72 }, n2: { x: 600, y: 0, w: 200, h: 72 } }

describe('proposalToPartials', () => {
  it('merges an edge into its ghost node item and creates review notes directly', async () => {
    const ops: Op[] = [
      { op: 'add_node', tempId: 't1', title: 'Gom cảnh → prompt', outputs: ['prompt'] },
      { op: 'add_edge', from: 'n1', to: 't1', label: 'cảnh × N' },
      { op: 'add_note', targets: ['n2'], text: 'Generate cần prompt', kind: 'review' },
    ]
    const r = await proposalToPartials(graph, boxes, ops, 'p1')
    expect(r.errors).toEqual([])
    expect(r.items).toHaveLength(1)
    expect(r.items[0].label).toBe('Thêm bước: Gom cảnh → prompt')
    expect(r.items[0].shapeIds).toHaveLength(2)

    const node = r.create.find((s) => s.type === 'wf-node')!
    expect(node.meta).toMatchObject({ ghost: 'p1' })
    expect(node.props).toMatchObject({ title: 'Gom cảnh → prompt', outputs: 'prompt' })
    const arrow = r.create.find((s) => s.type === 'arrow')!
    expect(arrow.meta).toMatchObject({ ghost: 'p1', edgeType: 'flow' })
    expect(r.bindings.filter((b) => b.fromId === arrow.id).map((b) => b.toId).sort()).toEqual(['shape:n1', node.id].sort())

    const note = r.create.find((s) => s.type === 'note')!
    expect(note.meta).toEqual({ author: 'ai', kind: 'review', targetIds: ['n2'] })
  })

  it('turns an update op into its own item that marks the target node', async () => {
    const r = await proposalToPartials(graph, boxes, [{ op: 'update_node', id: 'n2', title: 'Gọi API' }], 'p2')
    expect(r.items).toEqual([
      expect.objectContaining({ label: 'Sửa bước: Generate bằng API', shapeIds: ['shape:n2'], ops: [expect.anything()] }),
    ])
    expect(r.create).toEqual([])
  })

  it('reports ops that reference missing nodes', async () => {
    const r = await proposalToPartials(graph, boxes, [{ op: 'delete_node', id: 'gone' }], 'p3')
    expect(r.errors).toHaveLength(1)
    expect(r.items).toEqual([])
  })
})
