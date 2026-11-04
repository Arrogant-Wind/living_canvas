import { applyOps, layoutNewNodes, NODE_H, NODE_W, type Box, type Graph, type Op, type OpError } from '@lc/shared'
import { WF_NODE } from './storeToGraph'

/** Phần thuần (không import runtime tldraw) để test được trong node. */

export type ShapeId = `shape:${string}`

export interface ProposalItem {
  key: string
  label: string
  /** Shape ghost thuộc mục này (tạo mới), hoặc shape đích bị đánh dấu (sửa/xóa). */
  shapeIds: ShapeId[]
  /** Op áp lên shape có sẵn khi nhận (update/delete/set_parent/...). Rỗng với mục tạo mới. */
  ops: Op[]
  checked: boolean
}

export interface ShapeCreate {
  id: ShapeId
  type: string
  x: number
  y: number
  parentId?: ShapeId
  props: Record<string, unknown>
  meta: Record<string, unknown>
}
export interface BindingCreate {
  type: 'arrow'
  fromId: ShapeId
  toId: ShapeId
  props: { terminal: 'start' | 'end'; normalizedAnchor: { x: number; y: number }; isExact: false; isPrecise: false }
}

export interface Proposal {
  id: string
  reply: string
  items: ProposalItem[]
}

const sid = (graphId: string) => `shape:${graphId}` as ShapeId

export const plainToRichText = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }],
})

const binding = (fromId: ShapeId, toId: ShapeId, terminal: 'start' | 'end'): BindingCreate => ({
  type: 'arrow',
  fromId,
  toId,
  props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
})

export async function proposalToPartials(
  current: Graph,
  boxes: Record<string, Box>,
  ops: Op[],
  proposalId: string,
): Promise<{ create: ShapeCreate[]; bindings: BindingCreate[]; items: ProposalItem[]; errors: OpError[] }> {
  let i = 0
  const { graph, idMap, errors } = applyOps(current, ops, () => `${proposalId}-${++i}`)
  const failed = new Set(errors.map((e) => e.index))
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const oldTitle = (id: string) => current.nodes.find((n) => n.id === id)?.title ?? id
  const res = (ref: string) => idMap[ref] ?? ref

  const after: Record<string, string> = {}
  const newIds: string[] = []
  ops.forEach((op, k) => {
    if (op.op !== 'add_node' || failed.has(k)) return
    newIds.push(idMap[op.tempId])
    if (op.after) after[idMap[op.tempId]] = res(op.after)
  })
  const layout = await layoutNewNodes(graph, boxes, newIds, after)
  const pos = (id: string): Box => layout[id] ?? boxes[id] ?? { x: 0, y: 0, w: NODE_W, h: NODE_H }

  const create: ShapeCreate[] = []
  const bindings: BindingCreate[] = []
  const items: ProposalItem[] = []
  const itemOf = new Map<string, ProposalItem>()

  for (const id of newIds) {
    const n = byId.get(id)!
    const b = pos(id)
    const parent = n.parentId ? pos(n.parentId) : undefined
    create.push({
      id: sid(id),
      type: WF_NODE,
      // Con của shape khác dùng tọa độ tương đối với cha.
      x: parent ? b.x - parent.x : b.x,
      y: parent ? b.y - parent.y : b.y,
      ...(n.parentId && { parentId: sid(n.parentId) }),
      props: {
        w: b.w,
        h: b.h,
        title: n.title,
        kind: n.kind ?? 'unknown',
        inputs: (n.inputs ?? []).join(', '),
        outputs: (n.outputs ?? []).join(', '),
        description: n.description ?? '',
        container: false,
      },
      meta: { ghost: proposalId },
    })
    const item: ProposalItem = { key: id, label: `Thêm bước: ${n.title}`, shapeIds: [sid(id)], ops: [], checked: true }
    items.push(item)
    itemOf.set(id, item)
  }

  let edgeSeq = 0
  ops.forEach((op, k) => {
    if (failed.has(k)) return
    switch (op.op) {
      case 'add_edge': {
        const from = res(op.from)
        const to = res(op.to)
        const arrowId = sid(`${proposalId}-e${++edgeSeq}`)
        const a = pos(from)
        const b = pos(to)
        create.push({
          id: arrowId,
          type: 'arrow',
          x: 0,
          y: 0,
          props: {
            start: { x: a.x + a.w, y: a.y + a.h / 2 },
            end: { x: b.x, y: b.y + b.h / 2 },
            richText: plainToRichText(op.label ?? ''),
          },
          meta: { ghost: proposalId, edgeType: op.type ?? 'flow' },
        })
        bindings.push(binding(arrowId, sid(from), 'start'), binding(arrowId, sid(to), 'end'))
        const owner = itemOf.get(to) ?? itemOf.get(from)
        if (owner) owner.shapeIds.push(arrowId)
        else
          items.push({
            key: arrowId,
            label: `Nối: ${oldTitle(from)} → ${oldTitle(to)}${op.label ? ` (${op.label})` : ''}`,
            shapeIds: [arrowId],
            ops: [],
            checked: true,
          })
        break
      }
      case 'add_note': {
        const targets = op.targets.map(res)
        const t = pos(targets[0] ?? '')
        create.push({
          id: sid(`${proposalId}-note${k}`),
          type: 'note',
          x: t.x + t.w * 0.6,
          y: t.y - 150,
          props: { richText: plainToRichText(op.text), color: op.kind === 'review' ? 'orange' : 'yellow', size: 's' },
          meta: { author: 'ai', kind: op.kind, targetIds: targets },
        })
        break
      }
      case 'add_node':
        break
      default: {
        const target = 'id' in op ? op.id : ''
        const isEdge = op.op === 'update_edge' || op.op === 'delete_edge'
        const verb = { update_node: 'Sửa bước', delete_node: 'Xóa bước', set_parent: 'Đổi khung', update_edge: 'Sửa nhãn', delete_edge: 'Xóa mũi tên' }[op.op]
        const name = isEdge ? edgeName(current, target) : oldTitle(target)
        items.push({ key: `op${k}`, label: `${verb}: ${name}`, shapeIds: [sid(target)], ops: [op], checked: true })
      }
    }
  })

  return { create, bindings, items, errors }
}

function edgeName(g: Graph, id: string): string {
  const e = g.edges.find((x) => x.id === id)
  if (!e) return id
  const t = (n: string) => g.nodes.find((x) => x.id === n)?.title ?? n
  return `${t(e.from)} → ${t(e.to)}`
}
