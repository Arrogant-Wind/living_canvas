import { describe, expect, it } from 'vitest'
import type { Graph } from '../src/ir'
import { layoutNewNodes, NODE_W, overlaps, type Box } from '../src/layout'

const n = (id: string, extra = {}) => ({ id, title: id, status: 'draft' as const, ...extra })

describe('layoutNewNodes', () => {
  const boxes: Record<string, Box> = { n1: { x: 0, y: 0, w: 200, h: 72 }, n2: { x: 300, y: 0, w: 200, h: 72 } }

  it('places an `after` node without overlapping and never returns old ids', async () => {
    const g: Graph = { nodes: [n('n1'), n('n2'), n('t1')], edges: [{ id: 'e', from: 'n1', to: 't1', type: 'flow' }], notes: [] }
    const out = await layoutNewNodes(g, boxes, ['t1'], { t1: 'n1' })
    expect(Object.keys(out)).toEqual(['t1'])
    expect(overlaps(out.t1, boxes.n1)).toBe(false)
    expect(overlaps(out.t1, boxes.n2)).toBe(false)
    expect(out.t1.x).toBeGreaterThan(boxes.n1.x)
  })

  it('places a child inside its parent box', async () => {
    const c1: Box = { x: 600, y: 0, w: 420, h: 260 }
    const g: Graph = { nodes: [n('c1'), n('t1', { parentId: 'c1' }), n('t2', { parentId: 'c1' })], edges: [], notes: [] }
    const out = await layoutNewNodes(g, { c1 }, ['t1', 't2'])
    for (const id of ['t1', 't2']) {
      expect(out[id].x).toBeGreaterThanOrEqual(c1.x)
      expect(out[id].y).toBeGreaterThanOrEqual(c1.y)
      expect(out[id].x + out[id].w).toBeLessThanOrEqual(c1.x + c1.w)
    }
    expect(overlaps(out.t1, out.t2)).toBe(false)
  })

  it('keeps full node width for children of a small plain parent', async () => {
    const p: Box = { x: 0, y: 0, w: 200, h: 72 }
    const g: Graph = { nodes: [n('p'), n('t1', { parentId: 'p' }), n('t2', { parentId: 'p' })], edges: [], notes: [] }
    const out = await layoutNewNodes(g, { p }, ['t1', 't2'])
    expect(out.t1.w).toBe(NODE_W)
    expect(out.t2.w).toBe(NODE_W)
    expect(overlaps(out.t1, out.t2)).toBe(false)
    expect(out.t1.x).toBeGreaterThanOrEqual(p.x)
  })

  it('chains new nodes left to right and keeps them apart', async () => {
    const g: Graph = {
      nodes: [n('n1'), n('t1'), n('t2'), n('t3')],
      edges: [
        { id: 'a', from: 'n1', to: 't1', type: 'flow' },
        { id: 'b', from: 't1', to: 't2', type: 'flow' },
      ],
      notes: [],
    }
    const out = await layoutNewNodes(g, { n1: boxes.n1 }, ['t1', 't2', 't3'])
    expect(out.t2.x).toBeGreaterThan(out.t1.x)
    const all = [boxes.n1, out.t1, out.t2, out.t3]
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false)
  })
})
