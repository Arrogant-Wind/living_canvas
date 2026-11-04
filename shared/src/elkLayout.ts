import ELK from 'elkjs/lib/elk.bundled.js'
import type { Graph } from './ir'
import type { Box } from './layout'

/**
 * Sắp xếp bằng ELK (thuật toán `layered`): xếp lớp theo luồng, giảm mũi tên cắt nhau, xếp cả
 * khung lồng nhau trong một lần, chừa chỗ cho nhãn mũi tên. Phần xuống hàng (zigzag) làm ở
 * đây vì chế độ wrapping của ELK cắt hàng rất vụn (hàng 1–2 ô) và SINGLE_EDGE bị lỗi trong elkjs.
 */

const elk = new ELK()

const FRAME_PAD = 20
const LABEL_H = 22
const LABEL_PAD = 20
const BAND_GAP = 120
const MIN_COLS_PER_ROW = 3
const MIN_WRAP_W = 1400

export interface TidyOptions {
  /** Chiều cao phần tiêu đề của từng khung (ô con bắt đầu bên dưới). Mặc định 40. */
  headerH?: Record<string, number>
  /** Bề rộng tối thiểu của từng khung (để tiêu đề nằm trên một dòng). */
  minW?: Record<string, number>
  /** Khoảng cách giữa hai lớp (cột). */
  gapX?: number
  /** Bề rộng nhãn của từng mũi tên (theo edge id), đo ở canvas. */
  labelW?: Record<string, number>
  /** Tỉ lệ rộng/cao mong muốn. Có thì luồng dài xuống hàng kiểu zigzag cho gần tỉ lệ này. */
  aspect?: number
}

export interface TidyResult {
  /** Box mới (tọa độ trang) của mọi ô trong phạm vi, kể cả ô con và kích thước mới của khung. */
  boxes: Record<string, Box>
  /** Hàng (sau khi xuống dòng) của các thành viên trực tiếp của phạm vi. */
  band: Record<string, number>
}

interface ElkNode {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
  children?: ElkNode[]
  layoutOptions?: Record<string, string>
  edges?: unknown[]
}

export async function elkTidy(g: Graph, boxes: Record<string, Box>, scope: string | null, opts: TidyOptions = {}): Promise<TidyResult> {
  const ids = new Set(g.nodes.map((n) => n.id).filter((id) => boxes[id]))
  const parent = (id: string) => {
    const p = g.nodes.find((n) => n.id === id)?.parentId
    return p && ids.has(p) ? p : null
  }
  const childrenOf = new Map<string | null, string[]>()
  for (const n of g.nodes) if (ids.has(n.id)) childrenOf.set(parent(n.id), [...(childrenOf.get(parent(n.id)) ?? []), n.id])
  const members = childrenOf.get(scope) ?? []
  if (!members.length) return { boxes: {}, band: {} }

  const inScope = new Set<string>()
  const build = (id: string): ElkNode => {
    inScope.add(id)
    const kids = childrenOf.get(id) ?? []
    if (!kids.length) return { id, width: boxes[id].w, height: boxes[id].h }
    return {
      id,
      layoutOptions: {
        'elk.padding': `[top=${opts.headerH?.[id] ?? 40},left=${FRAME_PAD},bottom=${FRAME_PAD},right=${FRAME_PAD}]`,
        // Ô con không nối nhau là các thành phần rời: xếp chúng theo hàng ngang trong khung.
        'elk.aspectRatio': '3',
        ...(opts.minW?.[id] ? { 'elk.nodeSize.constraints': '[MINIMUM_SIZE]', 'elk.nodeSize.minimum': `(${opts.minW[id]}, 0)` } : {}),
      },
      children: kids.map(build),
    }
  }
  const children = members.map(build)
  const edges = g.edges
    .filter((e) => inScope.has(e.from) && inScope.has(e.to) && e.from !== e.to)
    .map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
      ...(opts.labelW?.[e.id] ? { labels: [{ id: `${e.id}:label`, text: e.label ?? ' ', width: opts.labelW[e.id], height: LABEL_H }] } : {}),
    }))

  const root: ElkNode = {
    id: '__root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(opts.gapX ?? 120),
      // tldraw vẽ nhãn ở giữa đường mũi tên (không ở chỗ ELK đặt): có nhãn thì giãn các ô
      // trong cùng cột ra để nhãn của hai nhánh kề nhau không đè lên nhau.
      'elk.spacing.nodeNode': edges.some((e) => 'labels' in e) ? '88' : '40',
      'elk.spacing.edgeLabel': String(LABEL_PAD / 2),
      'elk.edgeLabels.placement': 'CENTER',
      // Giữ thứ tự gần với thứ tự hiện có để lần sắp xếp sau không đảo lộn.
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      ...(scope ? { 'elk.padding': `[top=${opts.headerH?.[scope] ?? 40},left=${FRAME_PAD},bottom=${FRAME_PAD},right=${FRAME_PAD}]` } : {}),
    },
    children,
    edges,
  }
  const out = (await elk.layout(root as any)) as ElkNode

  // Tọa độ ELK tương đối với cha: cộng dồn thành tọa độ gốc ELK, rồi dời về chỗ của phạm vi.
  const rel: Record<string, Box> = {}
  const walk = (n: ElkNode, ox: number, oy: number) => {
    for (const c of n.children ?? []) {
      const b = { x: ox + (c.x ?? 0), y: oy + (c.y ?? 0), w: c.width ?? 0, h: c.height ?? 0 }
      rel[c.id] = b
      walk(c, b.x, b.y)
    }
  }
  walk(out, 0, 0)

  const descendants = (id: string): string[] => (childrenOf.get(id) ?? []).flatMap((k) => [k, ...descendants(k)])
  // ELK căn giữa ô hẹp trong lớp có ô rộng; mũi tên tới ô hẹp khi đó đi sát góc ô rộng.
  // Căn mép trái các ô trong cùng cột, ở mọi tầng (khung trong trước).
  const groups = [...childrenOf.entries()].filter(([p]) => p === scope || (p !== null && inScope.has(p)))
  for (const [, kids] of groups.reverse()) leftAlignColumns(kids, rel, descendants)
  const band = wrapZigzag(members, rel, descendants, opts.aspect, scope ? FRAME_PAD : 0)

  const origin = scope
    ? { x: boxes[scope].x, y: boxes[scope].y }
    : { x: Math.min(...members.map((m) => boxes[m].x)), y: Math.min(...members.map((m) => boxes[m].y)) }
  const result: Record<string, Box> = {}
  for (const [id, b] of Object.entries(rel)) result[id] = { ...b, x: b.x + origin.x, y: b.y + origin.y }
  if (scope) {
    const all = Object.values(rel)
    result[scope] = {
      ...origin,
      w: Math.max(opts.minW?.[scope] ?? 0, Math.max(...all.map((b) => b.x + b.w)) + FRAME_PAD),
      h: Math.max(...all.map((b) => b.y + b.h)) + FRAME_PAD,
    }
  }
  return { boxes: result, band }
}

/** Gom các ô thành cột theo khoảng x chồng nhau. */
function columnsOf(ids: string[], rel: Record<string, Box>) {
  const cols: { ids: string[]; x0: number; x1: number }[] = []
  for (const m of [...ids].sort((a, b) => rel[a].x - rel[b].x)) {
    const last = cols.at(-1)
    if (last && rel[m].x < last.x1) {
      last.ids.push(m)
      last.x1 = Math.max(last.x1, rel[m].x + rel[m].w)
    } else cols.push({ ids: [m], x0: rel[m].x, x1: rel[m].x + rel[m].w })
  }
  return cols
}

function leftAlignColumns(ids: string[], rel: Record<string, Box>, descendants: (id: string) => string[]) {
  for (const c of columnsOf(ids.filter((id) => rel[id]), rel))
    for (const m of c.ids) {
      const dx = c.x0 - rel[m].x
      if (dx) for (const k of [m, ...descendants(m)]) rel[k] = { ...rel[k], x: rel[k].x + dx }
    }
}

/**
 * Xuống hàng kiểu zigzag trên các cột ELK đã xếp (chỉ các thành viên trực tiếp; khung kéo
 * theo con của nó). Sửa `rel` tại chỗ, trả về hàng của từng thành viên.
 */
function wrapZigzag(
  members: string[],
  rel: Record<string, Box>,
  descendants: (id: string) => string[],
  aspect: number | undefined,
  pad: number,
): Record<string, number> {
  const band: Record<string, number> = Object.fromEntries(members.map((m) => [m, 0]))
  const cols = columnsOf(members, rel)
  const colW = (i: number) => cols[i].x1 - cols[i].x0
  const gapAfter = (i: number) => (i + 1 < cols.length ? cols[i + 1].x0 - cols[i].x1 : 0)
  const top = (i: number) => Math.min(...cols[i].ids.map((m) => rel[m].y))
  const colH = (i: number) => Math.max(...cols[i].ids.map((m) => rel[m].y + rel[m].h)) - top(i)
  const total = cols.reduce((s, _, i) => s + colW(i) + gapAfter(i), 0)
  if (!aspect || cols.length < MIN_COLS_PER_ROW * 2 || total <= MIN_WRAP_W) return band

  const idx = cols.map((_, i) => i)
  const bandsFor = (k: number): number[][] => {
    const target = total / k
    const out: number[][] = [[]]
    let w = 0
    for (const i of idx) {
      const add = colW(i) + gapAfter(i)
      if (out.length < k && out.at(-1)!.length >= MIN_COLS_PER_ROW && w + add / 2 > target) {
        out.push([])
        w = 0
      }
      out.at(-1)!.push(i)
      w += add
    }
    return out
  }
  const sizeOf = (bs: number[][]) => ({
    w: Math.max(...bs.map((b) => b.reduce((s, i, j) => s + colW(i) + (j < b.length - 1 ? gapAfter(i) : 0), 0))),
    h: bs.reduce((s, b) => s + Math.max(...b.map(colH)), 0) + BAND_GAP * (bs.length - 1),
  })
  let bands = [idx]
  let best = Infinity
  for (let k = 1; k <= Math.ceil(cols.length / MIN_COLS_PER_ROW); k++) {
    const b = bandsFor(k)
    if (b.some((x) => x.length < MIN_COLS_PER_ROW)) continue
    const { w, h } = sizeOf(b)
    const score = Math.abs(Math.log(w / h / aspect))
    if (score < best) {
      best = score
      bands = b
    }
  }
  if (bands.length === 1) return band

  // Hàng chẵn đi sang phải, hàng lẻ quay đầu sang trái. Hàng mới bắt đầu lùi ra ngoài một cột so
  // với cột cuối hàng trên, và cột kế tiếp không lọt vào khoảng mũi tên đi xuống.
  const pos: Record<number, { x: number; y: number }> = {}
  let by = Math.min(...members.map((m) => rel[m].y))
  let lastX = cols[0].x0
  let lastI = -1
  bands.forEach((b, r) => {
    const bandH = Math.max(...b.map(colH))
    const rightward = r % 2 === 0
    let x = r === 0 ? cols[0].x0 : rightward ? lastX - gapAfter(lastI) - colW(b[0]) : lastX + colW(lastI) + gapAfter(lastI)
    b.forEach((i, j) => {
      if (j > 0) x = rightward ? x + colW(b[j - 1]) + gapAfter(b[j - 1]) : x - gapAfter(b[j - 1]) - colW(i)
      if (r > 0 && j === 1) x = rightward ? Math.max(x, lastX + colW(lastI) + LABEL_PAD) : Math.min(x, lastX - colW(i) - LABEL_PAD)
      pos[i] = { x, y: by + (bandH - colH(i)) / 2 }
      for (const m of cols[i].ids) band[m] = r
    })
    lastX = x
    lastI = b.at(-1)!
    by += bandH + BAND_GAP
  })

  // Dời từng cột (kèm con của khung) tới chỗ mới; rồi kéo cả khối về sát lề trái.
  cols.forEach((c, i) => {
    const dx = pos[i].x - c.x0
    const dy = pos[i].y - top(i)
    for (const m of c.ids) for (const k of [m, ...descendants(m)]) rel[k] = { ...rel[k], x: rel[k].x + dx, y: rel[k].y + dy }
  })
  const shift = pad - Math.min(...members.map((m) => rel[m].x))
  if (shift) for (const k of Object.keys(rel)) rel[k] = { ...rel[k], x: rel[k].x + shift }
  return band
}

