import type { Graph } from './ir'

export type Box = { x: number; y: number; w: number; h: number }

export const NODE_W = 200
export const NODE_H = 72
const GAP_X = 140
const STEP_Y = 40
const PAD = 20
const MIN_CHILD_W = 140
/** Khe ngang giữa hai cột con: đủ chỗ cho nhãn mũi tên ngắn. */
const CHILD_GAP = 60

/** Kích thước tối thiểu để box cha chứa hết các box con (tọa độ trang). */
export function containerSizeFor(parent: Box, children: Box[]): { w: number; h: number } {
  return {
    w: Math.max(parent.w, ...children.map((c) => c.x + c.w + PAD - parent.x)),
    h: Math.max(parent.h, ...children.map((c) => c.y + c.h + PAD - parent.y)),
  }
}

export const overlaps = (a: Box, b: Box, margin = 10) =>
  a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin

/**
 * Tính vị trí (tọa độ trang) cho các node mới. Không bao giờ trả vị trí cho node cũ.
 * Thứ tự ưu tiên: có cha thì xếp lưới 2 cột trong box của cha; có `after` thì đặt bên
 * phải node đó; có cạnh vào từ một node đã có vị trí thì đặt bên phải node đó; còn lại
 * đặt dưới toàn bộ sơ đồ. Sau đó dời xuống từng bước 40px cho đến khi hết chồng.
 */
export async function layoutNewNodes(
  g: Graph,
  boxes: Record<string, Box>,
  newIds: string[],
  after: Record<string, string> = {},
): Promise<Record<string, Box>> {
  const placed: Record<string, Box> = { ...boxes }
  const out: Record<string, Box> = {}
  const node = new Map(g.nodes.map((n) => [n.id, n]))
  const pending = newIds.filter((id) => node.has(id))
  const childCount: Record<string, number> = {}

  const anchorOf = (id: string): string | undefined => {
    if (after[id] && placed[after[id]]) return after[id]
    const e = g.edges.find((x) => x.to === id && placed[x.from] && x.type === 'flow')
    return e?.from ?? g.edges.find((x) => x.to === id && placed[x.from])?.from
  }
  const ready = (id: string) => {
    const p = node.get(id)!.parentId
    if (p && !placed[p]) return false
    if (after[id] && !placed[after[id]] && pending.includes(after[id])) return false
    const incoming = g.edges.filter((x) => x.to === id && pending.includes(x.from) && !placed[x.from])
    return incoming.length === 0
  }
  const bottom = () => {
    const bs = Object.values(placed)
    return bs.length ? { x: Math.min(...bs.map((b) => b.x)), y: Math.max(...bs.map((b) => b.y + b.h)) + 80 } : { x: 0, y: 0 }
  }

  while (pending.length) {
    // Lấy node sẵn sàng đầu tiên theo thứ tự; nếu kẹt (vòng) thì lấy node đầu.
    const idx = Math.max(0, pending.findIndex(ready))
    const id = pending.splice(idx, 1)[0]
    const parentId = node.get(id)!.parentId
    let box: Box
    const others = () => Object.entries(placed).filter(([k]) => k !== parentId)

    if (parentId && placed[parentId]) {
      const p = placed[parentId]
      const i = childCount[parentId] ?? 0
      // Cha đủ rộng thì xếp vừa 2 cột bên trong; cha nhỏ (node thường) thì giữ cỡ node và để cha nới ra.
      const fit = (p.w - PAD * 2 - CHILD_GAP) / 2
      const w = fit >= MIN_CHILD_W ? Math.min(NODE_W, fit) : NODE_W
      box = { x: p.x + PAD + (i % 2) * (w + CHILD_GAP), y: p.y + 40 + Math.floor(i / 2) * (NODE_H + PAD), w, h: NODE_H }
      childCount[parentId] = i + 1
    } else {
      const a = anchorOf(id)
      box = a
        ? { x: placed[a].x + placed[a].w + GAP_X, y: placed[a].y, w: NODE_W, h: NODE_H }
        : { ...bottom(), w: NODE_W, h: NODE_H }
    }
    // Node con chỉ cần tránh anh em trong cùng cha; node thường tránh mọi box (trừ cha).
    const blockers = () =>
      parentId
        ? Object.entries(placed).filter(([k]) => node.get(k)?.parentId === parentId).map(([, b]) => b)
        : others().map(([, b]) => b)
    for (let guard = 0; guard < 500 && blockers().some((b) => overlaps(box, b)); guard++) box = { ...box, y: box.y + STEP_Y }
    placed[id] = box
    out[id] = box
  }
  return out
}
