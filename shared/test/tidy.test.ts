import { describe, expect, it } from 'vitest'
import type { Graph } from '../src/ir'
import { overlaps, type Box } from '../src/layout'
import { findClutter, tidy, tidyLayout } from '../src/tidy'

const n = (id: string, extra = {}) => ({ id, title: id, status: 'draft' as const, ...extra })
const e = (from: string, to: string) => ({ id: `${from}-${to}`, from, to, type: 'flow' as const })
const box = (x: number, y: number, w = 200, h = 56): Box => ({ x, y, w, h })
const noOverlap = (bs: Box[]) => {
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlaps(bs[i], bs[j], 0)).toBe(false)
}

describe('tidy', () => {
  it('lays a chain out left to right without overlaps', () => {
    const g: Graph = { nodes: [n('a'), n('b'), n('c')], edges: [e('a', 'b'), e('b', 'c')], notes: [] }
    const out = tidy(g, { a: box(0, 0), b: box(50, 10), c: box(60, 20) }, null)
    expect(out.a.x).toBeLessThan(out.b.x)
    expect(out.b.x).toBeLessThan(out.c.x)
    expect(out.b.x - (out.a.x + out.a.w)).toBeGreaterThanOrEqual(100)
    noOverlap([out.a, out.b, out.c])
  })

  it('puts branches of one source in the same column', () => {
    const g: Graph = { nodes: [n('a'), n('b'), n('c')], edges: [e('a', 'b'), e('a', 'c')], notes: [] }
    const out = tidy(g, { a: box(0, 0), b: box(0, 0), c: box(0, 0) }, null)
    expect(out.b.x).toBe(out.c.x)
    noOverlap([out.a, out.b, out.c])
  })

  it('arranges only the children of a frame, inside the frame under its header', () => {
    const g: Graph = {
      nodes: [n('f'), n('k1', { parentId: 'f' }), n('k2', { parentId: 'f' }), n('out')],
      edges: [e('k1', 'k2')],
      notes: [],
    }
    const boxes = { f: box(100, 100, 300, 200), k1: box(120, 150), k2: box(130, 160), out: box(900, 0) }
    const out = tidy(g, boxes, 'f', { headerH: 40 })
    expect(Object.keys(out).sort()).toEqual(['k1', 'k2'])
    for (const k of ['k1', 'k2']) {
      expect(out[k].x).toBeGreaterThanOrEqual(120)
      expect(out[k].y).toBeGreaterThanOrEqual(140)
    }
    noOverlap([out.k1, out.k2])
  })

  it('treats an edge into a frame child as an edge into the frame', () => {
    const g: Graph = {
      nodes: [n('a'), n('f'), n('k', { parentId: 'f' })],
      edges: [e('a', 'k')],
      notes: [],
    }
    const out = tidy(g, { a: box(500, 0), f: box(0, 0, 300, 150), k: box(20, 40) }, null)
    expect(out.a.x).toBeLessThan(out.f.x)
  })

  it('terminates on cycles', () => {
    const g: Graph = { nodes: [n('a'), n('b')], edges: [e('a', 'b'), e('b', 'a')], notes: [] }
    const out = tidy(g, { a: box(0, 0), b: box(0, 0) }, null)
    noOverlap([out.a, out.b])
  })

  it('keeps unconnected nodes clear of the flow', () => {
    const g: Graph = { nodes: [n('a'), n('b'), n('x')], edges: [e('a', 'b')], notes: [] }
    const out = tidy(g, { a: box(0, 0), b: box(0, 0), x: box(0, 0) }, null)
    noOverlap([out.a, out.b, out.x])
  })
})

describe('findClutter', () => {
  it('reports overlapping siblings with their scope', () => {
    const g: Graph = { nodes: [n('f'), n('k1', { parentId: 'f' }), n('k2', { parentId: 'f' }), n('a')], edges: [], notes: [] }
    const issues = findClutter(g, { f: box(0, 0, 400, 200), k1: box(20, 40), k2: box(100, 60), a: box(600, 0) })
    expect(issues).toEqual([{ scope: 'f', kind: 'overlap', ids: ['k1', 'k2'] }])
  })

  it('does not report a child sitting inside its own frame', () => {
    const g: Graph = { nodes: [n('f'), n('k', { parentId: 'f' })], edges: [], notes: [] }
    expect(findClutter(g, { f: box(0, 0, 400, 200), k: box(20, 40) })).toEqual([])
  })

  it('reports an arrow that passes through another node', () => {
    const g: Graph = { nodes: [n('a'), n('b'), n('c')], edges: [e('a', 'c')], notes: [] }
    const issues = findClutter(g, { a: box(0, 0), b: box(300, 0), c: box(600, 0) })
    expect(issues).toEqual([{ scope: null, kind: 'arrow-through', ids: ['a-c', 'b'] }])
  })
})

describe('findClutter with arrow labels and notes', () => {
  const g: Graph = { nodes: [n('a'), n('b'), n('c')], edges: [e('a', 'b'), e('a', 'c')], notes: [] }
  const boxes = { a: box(0, 0), b: box(400, -100), c: box(400, 100) }

  it('reports two arrow labels that overlap', () => {
    const labels = { 'a-b': box(250, 0, 80, 60), 'a-c': box(260, 30, 80, 60) }
    expect(findClutter(g, boxes, { labels })).toContainEqual({ scope: null, kind: 'label-overlap', ids: ['a-b', 'a-c'] })
  })

  it('reports a label covering a node that is not one of its ends', () => {
    const labels = { 'a-b': box(390, 110, 60, 20) }
    expect(findClutter(g, boxes, { labels })).toContainEqual({ scope: null, kind: 'label-overlap', ids: ['a-b', 'c'] })
  })

  it('reports a note covering a node', () => {
    const notes = { n1: box(380, -120, 200, 200) }
    expect(findClutter(g, boxes, { notes })).toContainEqual({ scope: null, kind: 'note-overlap', ids: ['n1', 'b'] })
  })

  it('stays quiet when labels sit in free space', () => {
    const labels = { 'a-b': box(250, -60, 80, 20), 'a-c': box(250, 80, 80, 20) }
    expect(findClutter(g, boxes, { labels })).toEqual([])
  })
})

describe('tidy with arrow labels', () => {
  it('widens a column gap to fit the longest label leaving that column', () => {
    const g: Graph = { nodes: [n('a'), n('b')], edges: [e('a', 'b')], notes: [] }
    const out = tidy(g, { a: box(0, 0), b: box(0, 0) }, null, { labelW: { 'a-b': 300 } })
    expect(out.b.x - (out.a.x + out.a.w)).toBeGreaterThanOrEqual(340)
  })
})

describe('tidy wrapping with a branching last column', () => {
  it('does not route the row change through a sibling in the same column', () => {
    // a → b → c → {d1, d2} → e → f → g → h : cột của d1/d2 là cột cuối hàng đầu.
    const ids = ['a', 'b', 'c', 'd1', 'd2', 'e', 'f', 'g', 'h']
    const g: Graph = {
      nodes: ids.map((id) => n(id)),
      edges: [e('a', 'b'), e('b', 'c'), e('c', 'd1'), e('c', 'd2'), e('d1', 'e'), e('d2', 'e'), e('e', 'f'), e('f', 'g'), e('g', 'h')],
      notes: [],
    }
    const boxes = Object.fromEntries(ids.map((id) => [id, box(0, 0)]))
    const out = tidy(g, boxes, null, { aspect: 16 / 9 })
    const issues = findClutter(g, out).filter((i) => i.kind === 'arrow-through')
    expect(issues).toEqual([])
  })
})

describe('tidy wrapping with a wide last column', () => {
  it('keeps the next row clear of the arrows coming down from a wide column', () => {
    // c là khung rộng, d nhỏ ở cùng cột; cả hai đi xuống e (cột quay đầu), rồi e → f → g.
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const g: Graph = {
      nodes: ids.map((id) => n(id)),
      edges: [e('a', 'b'), e('b', 'c'), e('b', 'd'), e('c', 'e'), e('d', 'e'), e('e', 'f'), e('f', 'g'), e('g', 'h')],
      notes: [],
    }
    const boxes = Object.fromEntries(ids.map((id) => [id, id === 'c' ? box(0, 0, 480, 116) : box(0, 0)]))
    const out = tidy(g, boxes, null, { aspect: 16 / 9, labelW: { 'c-e': 260, 'd-e': 120, 'e-f': 160 } })
    expect(findClutter(g, out).filter((i) => i.kind === 'arrow-through')).toEqual([])
  })
})

describe('tidy spacing for labelled branches', () => {
  it('spreads branch targets further apart when their incoming arrows carry labels', () => {
    const g: Graph = { nodes: [n('a'), n('b'), n('c')], edges: [e('a', 'b'), e('a', 'c')], notes: [] }
    const out = tidy(g, { a: box(0, 0), b: box(0, 0), c: box(0, 0) }, null, { labelW: { 'a-b': 150, 'a-c': 200 } })
    const [top, bottom] = [out.b, out.c].sort((p, q) => p.y - q.y)
    expect(bottom.y - (top.y + top.h)).toBeGreaterThanOrEqual(80)
  })
})

describe('tidy wrapping', () => {
  const chain = (k: number): Graph => ({
    nodes: Array.from({ length: k }, (_, i) => n(`s${i}`)),
    edges: Array.from({ length: k - 1 }, (_, i) => e(`s${i}`, `s${i + 1}`)),
    notes: [],
  })
  const zero = (k: number) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`s${i}`, box(0, 0)]))

  it('keeps a long chain on one row when no aspect is given', () => {
    const out = tidy(chain(8), zero(8), null)
    expect(new Set(Object.values(out).map((b) => b.y)).size).toBe(1)
  })

  it('wraps a long chain into zigzag rows so the step between rows is short', () => {
    const out = tidy(chain(8), zero(8), null, { aspect: 16 / 9 })
    const ids = Array.from({ length: 8 }, (_, i) => `s${i}`)
    const rowYs = [...new Set(ids.map((id) => out[id].y))].sort((a, b) => a - b)
    expect(rowYs.length).toBeGreaterThan(1)
    noOverlap(Object.values(out))
    // Trong một hàng: hàng chẵn đi sang phải, hàng lẻ đi sang trái.
    for (let i = 1; i < ids.length; i++) {
      const a = out[ids[i - 1]]
      const b = out[ids[i]]
      const row = rowYs.indexOf(a.y)
      if (a.y === b.y) expect(row % 2 === 0 ? b.x > a.x : b.x < a.x).toBe(true)
      // Chuyển hàng: ô kế tiếp ở hàng dưới, lùi ra ngoài một cột theo hướng của hàng trên
      // (để mũi tên đi vòng ra ngoài, không xuyên qua các ô khác cùng cột).
      else expect(row % 2 === 0 ? b.x > a.x : b.x < a.x).toBe(true)
    }
    const xs = Object.values(out).map((b) => b.x)
    const ys = Object.values(out).map((b) => b.y + b.h)
    const w = Math.max(...xs) + 200 - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...Object.values(out).map((b) => b.y))
    // Một hàng thì 8 ô dài ~43:1; xuống hàng phải gọn hơn hẳn.
    expect(w / h).toBeLessThan(10)
  })

  it('reports which row each node landed in', () => {
    const { boxes, band } = tidyLayout(chain(8), zero(8), null, { aspect: 16 / 9 })
    const ids = Array.from({ length: 8 }, (_, i) => `s${i}`)
    expect(band.s0).toBe(0)
    expect(band.s7).toBeGreaterThan(0)
    for (const id of ids) expect(boxes[id].y > boxes.s0.y).toBe(band[id] > 0)
  })

  it('does not wrap a short chain', () => {
    const out = tidy(chain(3), zero(3), null, { aspect: 16 / 9 })
    expect(new Set(Object.values(out).map((b) => b.y)).size).toBe(1)
  })
})
