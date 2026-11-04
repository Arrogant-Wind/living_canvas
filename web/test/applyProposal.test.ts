import type { Graph, Op } from '@lc/shared'
import { describe, expect, it } from 'vitest'
import { estimateNoteHeight, NOTE_W, proposalToPartials } from '../src/canvas/applyProposal'

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

  it('places long review notes above their target without overlapping each other', async () => {
    const long = 'Lệch dữ liệu: '.repeat(20)
    const r = await proposalToPartials(
      graph,
      boxes,
      [
        { op: 'add_note', targets: ['n2'], text: long, kind: 'review' },
        { op: 'add_note', targets: ['n2'], text: 'ngắn', kind: 'review' },
      ],
      'p4',
    )
    const notes = r.create.filter((s) => s.type === 'note')
    const h = notes.map((n) => estimateNoteHeight(String((n.props.richText as any).content[0].content[0].text)))
    notes.forEach((n, i) => expect(n.y + h[i]).toBeLessThan(boxes.n2.y))
    expect(Math.abs(notes[0].x - notes[1].x)).toBeGreaterThanOrEqual(NOTE_W)
  })

  it('turns a new parent into a container big enough for its new children', async () => {
    const r = await proposalToPartials(
      graph,
      boxes,
      [
        { op: 'add_node', tempId: 'c', title: 'Chuẩn hóa' },
        { op: 'add_node', tempId: 'k1', title: 'Nhân vật', parent: 'c' },
        { op: 'add_node', tempId: 'k2', title: 'Bối cảnh', parent: 'c' },
      ],
      'p5',
    )
    const parent = r.create.find((s) => s.props.title === 'Chuẩn hóa')!
    expect(parent.props.container).toBe(true)
    for (const t of ['Nhân vật', 'Bối cảnh']) {
      const k = r.create.find((s) => s.props.title === t)!
      expect(k.parentId).toBe(parent.id)
      expect(k.x + (k.props.w as number)).toBeLessThanOrEqual(parent.props.w as number)
      expect(k.y + (k.props.h as number)).toBeLessThanOrEqual(parent.props.h as number)
    }
  })

  it('marks an existing plain parent to be fitted as a container on accept', async () => {
    const r = await proposalToPartials(graph, boxes, [{ op: 'add_node', tempId: 'k', title: 'Gọi API', parent: 'n2' }], 'p6')
    expect(r.items[0].fitParent).toBe('shape:n2')
  })

  it('reports ops that reference missing nodes', async () => {
    const r = await proposalToPartials(graph, boxes, [{ op: 'delete_node', id: 'gone' }], 'p3')
    expect(r.errors).toHaveLength(1)
    expect(r.items).toEqual([])
  })
})
