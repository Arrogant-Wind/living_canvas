import type { Graph } from './ir'
import { overlaps, type Box } from './layout'

/** Chỗ rối trên canvas, tìm bằng code (không cần AI). `scope` = khung chứa (null = trang). */
export interface Clutter {
  scope: string | null
  kind: 'overlap' | 'arrow-through' | 'label-overlap' | 'note-overlap'
  ids: string[]
}

const PAD = 20
const GAP_Y = 40
/** Khe dọc khi các ô trong cột nhận mũi tên có nhãn: đủ chỗ cho hai nhãn không đè nhau. */
const GAP_Y_LABELLED = 88
/** Xuống hàng: khoảng cách giữa hai hàng, số cột tối thiểu mỗi hàng, bề rộng tối thiểu mới xuống hàng. */
const BAND_GAP = 120
const MIN_COLS_PER_ROW = 3
const MIN_WRAP_W = 1400
const ISO_PER_ROW = 3
/** Khoảng trống hai bên nhãn mũi tên trong khe giữa hai cột. */
const LABEL_PAD = 20

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

/**
 * Xếp lại các thành viên trực tiếp của `scope` (con của khung, hoặc các ô cấp trang khi
 * scope = null) theo luồng: cột theo thứ hạng trên đường đi dài nhất, thứ tự trong cột theo
 * trung bình vị trí của ô đứng trước (ít mũi tên cắt nhau). Ô không nối gì xếp lưới phía dưới.
 * Kích thước ô giữ nguyên. Trả về box mới (tọa độ trang) chỉ cho các thành viên.
 */
export function tidy(...args: Parameters<typeof tidyLayout>): Record<string, Box> {
  return tidyLayout(...args).boxes
}

/** Như `tidy`, kèm `band`: ô nằm ở hàng thứ mấy sau khi xuống dòng (ô không nối gì: -1). */
export function tidyLayout(
  g: Graph,
  boxes: Record<string, Box>,
  scope: string | null,
  opts: {
    headerH?: number
    gapX?: number
    labelW?: Record<string, number>
    /** Tỉ lệ rộng/cao mong muốn. Có thì luồng dài được xuống hàng (như đọc chữ) cho gần tỉ lệ này. */
    aspect?: number
  } = {},
): { boxes: Record<string, Box>; band: Record<string, number> } {
  const parent = parentOf(g)
  const gapX = opts.gapX ?? 120
  const bandOf: Record<string, number> = {}
  const members = g.nodes.map((n) => n.id).filter((id) => boxes[id] && parent(id) === scope)
  if (!members.length) return { boxes: {}, band: bandOf }
  const isMember = new Set(members)
  const rep = (id: string): string | null => {
    for (let cur: string | null = id; cur; cur = parent(cur)) if (isMember.has(cur)) return cur
    return null
  }

  // Cạnh giữa các thành viên (cạnh tới con của một thành viên tính là tới thành viên đó).
  const succ = new Map<string, string[]>(members.map((m) => [m, []]))
  const seen = new Set<string>()
  /** Nhãn rộng nhất trên các mũi tên rời mỗi thành viên (để nới khe sau cột của nó). */
  const outLabel = new Map<string, number>()
  /** Thành viên có mũi tên mang nhãn đi vào: cột của nó cần khe dọc rộng hơn cho nhãn. */
  const labelledIn = new Set<string>()
  for (const e of g.edges) {
    const a = rep(e.from)
    const b = rep(e.to)
    if (!a || !b || a === b) continue
    outLabel.set(a, Math.max(outLabel.get(a) ?? 0, opts.labelW?.[e.id] ?? 0))
    if (opts.labelW?.[e.id]) labelledIn.add(b)
    if (e.type !== 'flow' || seen.has(`${a}>${b}`)) continue
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
  const gapY = (col: string[]) => (col.some((m) => labelledIn.has(m)) ? GAP_Y_LABELLED : GAP_Y)
  const ranks = cols.map((c, r) => r).filter((r) => cols[r]?.length)
  const colW = (r: number) => Math.max(...cols[r].map((m) => boxes[m].w))
  const colH = (r: number) => cols[r].reduce((s, m) => s + boxes[m].h, 0) + gapY(cols[r]) * (cols[r].length - 1)
  const gapAfter = (r: number) => Math.max(gapX, Math.max(0, ...cols[r].map((m) => outLabel.get(m) ?? 0)) + LABEL_PAD * 2)

  // Chia các cột thành hàng (band). Mặc định một hàng; có `aspect` thì thử 1..n hàng, lấy cách
  // chia có tỉ lệ rộng/cao gần nhất, với điều kiện mỗi hàng ≥ MIN_COLS_PER_ROW cột.
  const bandsFor = (k: number): number[][] => {
    const total = ranks.reduce((s, r) => s + colW(r) + gapAfter(r), 0)
    const target = total / k
    const out: number[][] = [[]]
    let w = 0
    for (const r of ranks) {
      const add = colW(r) + gapAfter(r)
      if (out.length < k && out.at(-1)!.length >= MIN_COLS_PER_ROW && w + add / 2 > target) {
        out.push([])
        w = 0
      }
      out.at(-1)!.push(r)
      w += add
    }
    return out
  }
  const sizeOf = (bands: number[][]) => {
    const w = Math.max(...bands.map((b) => b.reduce((s, r, i) => s + colW(r) + (i < b.length - 1 ? gapAfter(r) : 0), 0)))
    const h = bands.reduce((s, b) => s + Math.max(...b.map(colH)), 0) + BAND_GAP * (bands.length - 1)
    return { w, h }
  }
  let bands = [ranks]
  if (opts.aspect && ranks.length >= MIN_COLS_PER_ROW * 2 && sizeOf(bands).w > MIN_WRAP_W) {
    let best = Infinity
    for (let k = 1; k <= Math.ceil(ranks.length / MIN_COLS_PER_ROW); k++) {
      const b = bandsFor(k)
      if (b.some((band) => band.length < MIN_COLS_PER_ROW)) continue
      const { w, h } = sizeOf(b)
      const score = Math.abs(Math.log(w / h / opts.aspect))
      if (score < best) {
        best = score
        bands = b
      }
    }
  }

  // Zigzag: hàng chẵn đi trái → phải, hàng lẻ quay đầu phải → trái. Cột đầu của mỗi hàng
  // thẳng hàng với cột cuối của hàng trên, nên mũi tên chuyển hàng chỉ là một đoạn đi xuống.
  let by = oy
  let maxH = 0
  let lastX = ox
  let lastR = -1
  const placed: string[] = []
  bands.forEach((band, i) => {
    const bandH = Math.max(...band.map(colH))
    const rightward = i % 2 === 0
    // Hàng mới bắt đầu lùi ra ngoài một cột so với cột cuối hàng trên: mũi tên chuyển hàng đi
    // vòng ra ngoài rồi xuống, không xuyên qua các ô khác trong cột cuối.
    let x = i === 0 ? ox : rightward ? lastX - gapAfter(lastR) - colW(band[0]) : lastX + colW(lastR) + gapAfter(lastR)
    band.forEach((r, j) => {
      if (j > 0) x = rightward ? x + colW(band[j - 1]) + gapAfter(band[j - 1]) : x - gapAfter(band[j - 1]) - colW(r)
      // Cột thứ hai sau khi quay đầu không được lọt vào khoảng giữa cột cuối hàng trên và cột
      // quay đầu: mũi tên từ hàng trên đi xuống qua đúng khoảng đó.
      if (i > 0 && j === 1) x = rightward ? Math.max(x, lastX + colW(lastR) + LABEL_PAD) : Math.min(x, lastX - colW(r) - LABEL_PAD)
      let y = by + (bandH - colH(r)) / 2
      for (const m of cols[r]) {
        out[m] = { ...boxes[m], x, y }
        bandOf[m] = i
        placed.push(m)
        y += boxes[m].h + gapY(cols[r])
      }
    })
    lastX = x
    lastR = band.at(-1)!
    by += bandH + BAND_GAP
    maxH = by - BAND_GAP - oy
  })
  // Hàng quay đầu có thể lấn sang trái gốc: dời cả khối về lại gốc.
  const shiftX = ox - Math.min(...placed.map((m) => out[m].x))
  if (shiftX > 0) for (const m of placed) out[m].x += shiftX

  // Ô không nối gì: lưới tối đa 3 cột, dưới phần luồng.
  let iy = connected.length ? oy + maxH + GAP_Y * 2 : oy
  for (let i = 0; i < isolated.length; i += ISO_PER_ROW) {
    const row = isolated.slice(i, i + ISO_PER_ROW)
    let ix = ox
    for (const m of row) {
      out[m] = { ...boxes[m], x: ix, y: iy }
      bandOf[m] = -1
      ix += boxes[m].w + GAP_Y
    }
    iy += Math.max(...row.map((m) => boxes[m].h)) + GAP_Y
  }
  return { boxes: out, band: bandOf }
}
