import type { Graph } from './ir'
import { overlaps, type Box } from './layout'

/** Chỗ rối trên canvas, tìm bằng code (không cần AI). `scope` = khung chứa (null = trang). */
export interface Clutter {
  scope: string | null
  kind: 'overlap' | 'arrow-through' | 'label-overlap' | 'note-overlap'
  ids: string[]
}


const parentOf = (g: Graph) => {
  const ids = new Set(g.nodes.map((n) => n.id))
  return (id: string): string | null => {
    const p = g.nodes.find((n) => n.id === id)?.parentId
    return p && ids.has(p) ? p : null
  }
}

/** Đoạn thẳng p→q có cắt hình chữ nhật (đã thu vào `inset`) không. */
function segmentHitsBox(p: { x: number; y: number }, q: { x: number; y: number }, b: Box, inset = 4): boolean {
  const x0 = b.x + inset
  const y0 = b.y + inset
  const x1 = b.x + b.w - inset
  const y1 = b.y + b.h - inset
  // Liang–Barsky
  let t0 = 0
  let t1 = 1
  const dx = q.x - p.x
  const dy = q.y - p.y
  for (const [pk, qk] of [
    [-dx, p.x - x0],
    [dx, x1 - p.x],
    [-dy, p.y - y0],
    [dy, y1 - p.y],
  ]) {
    if (pk === 0) {
      if (qk < 0) return false
      continue
    }
    const t = qk / pk
    if (pk < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return true
}

/**
 * `extras.labels`: box nhãn của từng mũi tên (theo edge id); `extras.notes`: box của note.
 * Cả hai đều ở tọa độ trang, do canvas đo (model không biết chữ hiển thị to cỡ nào).
 */
type Pt = { x: number; y: number }

/**
 * Đường đi xấp xỉ của mũi tên gấp khúc (elbow) từ a tới b: ra cạnh gần, đi ngang (hoặc dọc)
 * tới giữa khe, rẽ, rồi vào cạnh đối diện của b. Đủ để biết mũi tên có cắt qua ô khác không.
 */
function elbowPath(a: Box, b: Box): [Pt, Pt][] {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const gapX = b.x > a.x + a.w ? b.x - (a.x + a.w) : a.x > b.x + b.w ? a.x - (b.x + b.w) : -1
  if (gapX >= 0) {
    const xm = b.x > a.x ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2
    const p0 = { x: b.x > a.x ? a.x + a.w : a.x, y: ac.y }
    const p3 = { x: b.x > a.x ? b.x : b.x + b.w, y: bc.y }
    return [
      [p0, { x: xm, y: ac.y }],
      [{ x: xm, y: ac.y }, { x: xm, y: bc.y }],
      [{ x: xm, y: bc.y }, p3],
    ]
  }
  const ym = b.y > a.y ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2
  const p0 = { x: ac.x, y: b.y > a.y ? a.y + a.h : a.y }
  const p3 = { x: bc.x, y: b.y > a.y ? b.y : b.y + b.h }
  return [
    [p0, { x: ac.x, y: ym }],
    [{ x: ac.x, y: ym }, { x: bc.x, y: ym }],
    [{ x: bc.x, y: ym }, p3],
  ]
}

export function findClutter(
  g: Graph,
  boxes: Record<string, Box>,
  extras: { labels?: Record<string, Box>; notes?: Record<string, Box> } = {},
): Clutter[] {
  const parent = parentOf(g)
  const out: Clutter[] = []
  const nodes = g.nodes.filter((n) => boxes[n.id])

  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].id
      const b = nodes[j].id
      if (parent(a) !== parent(b)) continue
      if (overlaps(boxes[a], boxes[b], 0)) out.push({ scope: parent(a), kind: 'overlap', ids: [a, b] })
    }

  const ancestors = (id: string) => {
    const xs = new Set<string>()
    for (let p = parent(id); p && !xs.has(p); p = parent(p)) xs.add(p)
    return xs
  }
  for (const e of g.edges) {
    const a = boxes[e.from]
    const b = boxes[e.to]
    if (!a || !b) continue
    const path = elbowPath(a, b)
    const skip = new Set([e.from, e.to, ...ancestors(e.from), ...ancestors(e.to)])
    for (const n of nodes) {
      if (skip.has(n.id) || ancestors(n.id).has(e.from) || ancestors(n.id).has(e.to)) continue
      if (path.some(([p, q]) => segmentHitsBox(p, q, boxes[n.id]))) {
        out.push({ scope: parent(n.id), kind: 'arrow-through', ids: [e.id, n.id] })
      }
    }
  }

  // Nhãn mũi tên: chồng nhãn khác, hoặc đè lên ô không phải hai đầu của nó.
  const labels = Object.entries(extras.labels ?? {})
  const edgeById = new Map(g.edges.map((e) => [e.id, e]))
  const edgeScope = (id: string) => {
    const e = edgeById.get(id)
    return e && parent(e.from) === parent(e.to) ? parent(e.from) : null
  }
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (overlaps(labels[i][1], labels[j][1], 0))
        out.push({ scope: edgeScope(labels[i][0]) === edgeScope(labels[j][0]) ? edgeScope(labels[i][0]) : null, kind: 'label-overlap', ids: [labels[i][0], labels[j][0]] })
  const isFrame = new Set(g.nodes.map((n) => n.parentId).filter(Boolean) as string[])
  for (const [id, lb] of labels) {
    const e = edgeById.get(id)
    const skip = new Set(e ? [e.from, e.to, ...ancestors(e.from), ...ancestors(e.to)] : [])
    for (const n of nodes)
      // Khung chỉ tính phần tiêu đề/viền; nhãn đi ngang qua lòng khung trống thì không sao.
      if (!skip.has(n.id) && !isFrame.has(n.id) && overlaps(lb, boxes[n.id], 0))
        out.push({ scope: edgeScope(id), kind: 'label-overlap', ids: [id, n.id] })
  }

  // Note đè lên ô, lên nhãn hoặc lên note khác.
  const notes = Object.entries(extras.notes ?? {})
  for (let i = 0; i < notes.length; i++) {
    const [id, nb] = notes[i]
    for (const n of nodes) if (!isFrame.has(n.id) && overlaps(nb, boxes[n.id], 0)) out.push({ scope: null, kind: 'note-overlap', ids: [id, n.id] })
    for (const [lid, lb] of labels) if (overlaps(nb, lb, 0)) out.push({ scope: null, kind: 'note-overlap', ids: [id, lid] })
    for (let j = i + 1; j < notes.length; j++) if (overlaps(nb, notes[j][1], 0)) out.push({ scope: null, kind: 'note-overlap', ids: [id, notes[j][0]] })
  }
  return out
}
