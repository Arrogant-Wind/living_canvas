import type { Graph } from './ir'
import { overlaps, type Box } from './layout'

/** Chỗ rối trên canvas, tìm bằng code (không cần AI). `scope` = khung chứa (null = trang). */
export interface Clutter {
  scope: string | null
  kind: 'overlap' | 'arrow-through'
  ids: string[]
}

const PAD = 20
const GAP_Y = 40
const ISO_PER_ROW = 3

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

export function findClutter(g: Graph, boxes: Record<string, Box>): Clutter[] {
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
  const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
  for (const e of g.edges) {
    const a = boxes[e.from]
    const b = boxes[e.to]
    if (!a || !b) continue
    const skip = new Set([e.from, e.to, ...ancestors(e.from), ...ancestors(e.to)])
    for (const n of nodes) {
      if (skip.has(n.id) || ancestors(n.id).has(e.from) || ancestors(n.id).has(e.to)) continue
      if (segmentHitsBox(center(a), center(b), boxes[n.id])) {
        out.push({ scope: parent(n.id), kind: 'arrow-through', ids: [e.id, n.id] })
      }
    }
  }
  return out
}

/**
 * Xếp lại các thành viên trực tiếp của `scope` (con của khung, hoặc các ô cấp trang khi
 * scope = null) theo luồng: cột theo thứ hạng trên đường đi dài nhất, thứ tự trong cột theo
 * trung bình vị trí của ô đứng trước (ít mũi tên cắt nhau). Ô không nối gì xếp lưới phía dưới.
 * Kích thước ô giữ nguyên. Trả về box mới (tọa độ trang) chỉ cho các thành viên.
 */
export function tidy(
  g: Graph,
  boxes: Record<string, Box>,
  scope: string | null,
  opts: { headerH?: number; gapX?: number } = {},
): Record<string, Box> {
  const parent = parentOf(g)
  const gapX = opts.gapX ?? 120
  const members = g.nodes.map((n) => n.id).filter((id) => boxes[id] && parent(id) === scope)
  if (!members.length) return {}
  const isMember = new Set(members)
  const rep = (id: string): string | null => {
    for (let cur: string | null = id; cur; cur = parent(cur)) if (isMember.has(cur)) return cur
    return null
  }

  // Cạnh giữa các thành viên (cạnh tới con của một thành viên tính là tới thành viên đó).
  const succ = new Map<string, string[]>(members.map((m) => [m, []]))
  const seen = new Set<string>()
  for (const e of g.edges) {
    if (e.type !== 'flow') continue
    const a = rep(e.from)
    const b = rep(e.to)
    if (!a || !b || a === b || seen.has(`${a}>${b}`)) continue
    seen.add(`${a}>${b}`)
    succ.get(a)!.push(b)
  }
  const pred = new Map<string, string[]>(members.map((m) => [m, []]))
  for (const [a, bs] of succ) for (const b of bs) pred.get(b)!.push(a)

  // Bỏ cạnh quay lui (DFS theo thứ tự trái → phải hiện tại) để có DAG.
  const byPos = [...members].sort((a, b) => boxes[a].x - boxes[b].x || boxes[a].y - boxes[b].y)
  const state = new Map<string, 0 | 1 | 2>()
  const dag = new Map<string, string[]>(members.map((m) => [m, []]))
  const post: string[] = []
  const visit = (u: string) => {
    state.set(u, 1)
    for (const v of succ.get(u)!) {
      if (state.get(v) === 1) continue // cạnh quay lui
      dag.get(u)!.push(v)
      if (!state.get(v)) visit(v)
    }
    state.set(u, 2)
    post.push(u)
  }
  for (const m of byPos.filter((m) => !pred.get(m)!.length)) if (!state.get(m)) visit(m)
  for (const m of byPos) if (!state.get(m)) visit(m)

  const rank = new Map<string, number>(members.map((m) => [m, 0]))
  for (const u of post.reverse()) for (const v of dag.get(u)!) rank.set(v, Math.max(rank.get(v)!, rank.get(u)! + 1))

  const connected = members.filter((m) => succ.get(m)!.length || pred.get(m)!.length)
  const isolated = members.filter((m) => !connected.includes(m))

  const ox = scope ? boxes[scope].x + PAD : Math.min(...members.map((m) => boxes[m].x))
  const oy = scope ? boxes[scope].y + (opts.headerH ?? 40) : Math.min(...members.map((m) => boxes[m].y))
  const out: Record<string, Box> = {}

  // Cột theo thứ hạng; trong cột sắp theo trung bình thứ tự của ô đứng trước.
  const cols: string[][] = []
  for (const m of connected) (cols[rank.get(m)!] ??= []).push(m)
  const index = new Map<string, number>()
  cols.forEach((col, r) => {
    col.sort((a, b) => boxes[a].y - boxes[b].y || boxes[a].x - boxes[b].x)
    if (r > 0) {
      const bary = (m: string) => {
        const ps = pred.get(m)!.filter((p) => index.has(p))
        return ps.length ? ps.reduce((s, p) => s + index.get(p)!, 0) / ps.length : Number.MAX_SAFE_INTEGER
      }
      col.sort((a, b) => bary(a) - bary(b))
    }
    col.forEach((m, i) => index.set(m, i))
  })
  const colH = cols.map((col) => (col ?? []).reduce((s, m) => s + boxes[m].h, 0) + GAP_Y * Math.max(0, (col ?? []).length - 1))
  const maxH = Math.max(0, ...colH)
  let x = ox
  cols.forEach((col, r) => {
    if (!col?.length) return
    let y = oy + (maxH - colH[r]) / 2
    for (const m of col) {
      out[m] = { ...boxes[m], x, y }
      y += boxes[m].h + GAP_Y
    }
    x += Math.max(...col.map((m) => boxes[m].w)) + gapX
  })

  // Ô không nối gì: lưới tối đa 3 cột, dưới phần luồng.
  let iy = connected.length ? oy + maxH + GAP_Y * 2 : oy
  for (let i = 0; i < isolated.length; i += ISO_PER_ROW) {
    const row = isolated.slice(i, i + ISO_PER_ROW)
    let ix = ox
    for (const m of row) {
      out[m] = { ...boxes[m], x: ix, y: iy }
      ix += boxes[m].w + GAP_Y
    }
    iy += Math.max(...row.map((m) => boxes[m].h)) + GAP_Y
  }
  return out
}
