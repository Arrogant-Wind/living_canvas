import type { Graph, Op } from './ir'

export interface OpError {
  index: number
  op: Op
  reason: string
}

const clone = (g: Graph): Graph => structuredClone(g)

/**
 * Áp lần lượt từng op lên bản sao của graph. Op lỗi bị bỏ qua (ghi vào errors),
 * op sau vẫn được xét trên trạng thái đã có các op hợp lệ trước đó.
 * `tempId` của add_node được ánh xạ sang id thật qua `newId`.
 */
function simulate(g0: Graph, ops: Op[], newId: (tempId: string) => string) {
  const g = clone(g0)
  const idMap: Record<string, string> = {}
  const ok: Op[] = []
  const errors: OpError[] = []
  const has = (id: string) => g.nodes.some((n) => n.id === id)
  const res = (ref: string) => idMap[ref] ?? ref
  const need = (ref: string, what = 'node'): string => {
    const id = res(ref)
    if (!has(id)) throw new Error(`${what} "${ref}" không tồn tại`)
    return id
  }
  const isAncestor = (anc: string, id: string): boolean => {
    let cur = g.nodes.find((n) => n.id === id)?.parentId
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      if (cur === anc) return true
      seen.add(cur)
      cur = g.nodes.find((n) => n.id === cur)?.parentId
    }
    return false
  }

  ops.forEach((op, index) => {
    try {
      switch (op.op) {
        case 'add_node': {
          if (idMap[op.tempId] || has(op.tempId)) throw new Error(`tempId "${op.tempId}" bị trùng`)
          const parentId = op.parent ? need(op.parent, 'parent') : undefined
          if (op.after) need(op.after, 'after')
          const id = newId(op.tempId)
          idMap[op.tempId] = id
          g.nodes.push({
            id,
            title: op.title,
            status: 'draft',
            ...(op.kind && { kind: op.kind }),
            ...(parentId && { parentId }),
            ...(op.inputs && { inputs: op.inputs }),
            ...(op.outputs && { outputs: op.outputs }),
            ...(op.inputSchema && { inputSchema: op.inputSchema }),
            ...(op.outputSchema && { outputSchema: op.outputSchema }),
            ...(op.description && { description: op.description }),
          })
          break
        }
        case 'update_node': {
          const n = g.nodes.find((x) => x.id === need(op.id))!
          const { op: _o, id: _i, ...fields } = op
          Object.assign(n, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)))
          break
        }
        case 'delete_node': {
          const id = need(op.id)
          g.nodes = g.nodes.filter((n) => n.id !== id)
          g.nodes.forEach((n) => n.parentId === id && delete n.parentId)
          g.edges = g.edges.filter((e) => e.from !== id && e.to !== id)
          g.notes.forEach((c) => (c.targetIds = c.targetIds.filter((t) => t !== id)))
          break
        }
        case 'set_parent': {
          const id = need(op.id)
          const n = g.nodes.find((x) => x.id === id)!
          if (op.parent === null) {
            delete n.parentId
            break
          }
          const p = need(op.parent, 'parent')
          if (p === id) throw new Error(`node "${op.id}" không thể là cha của chính nó`)
          if (isAncestor(id, p)) throw new Error(`đặt "${op.parent}" làm cha của "${op.id}" sẽ tạo vòng cha-con`)
          n.parentId = p
          break
        }
        case 'add_edge': {
          const from = need(op.from, 'from')
          const to = need(op.to, 'to')
          const type = op.type ?? 'flow'
          if (from === to) throw new Error(`cạnh "${op.from}" → "${op.to}" nối node với chính nó`)
          if (g.edges.some((e) => e.from === from && e.to === to && e.type === type))
            throw new Error(`cạnh "${op.from}" → "${op.to}" đã có`)
          g.edges.push({ id: newId(`edge`), from, to, type, ...(op.label && { label: op.label }) })
          break
        }
        case 'update_edge': {
          const e = g.edges.find((x) => x.id === op.id)
          if (!e) throw new Error(`edge "${op.id}" không tồn tại`)
          if (op.label !== undefined) e.label = op.label
          break
        }
        case 'delete_edge': {
          if (!g.edges.some((x) => x.id === op.id)) throw new Error(`edge "${op.id}" không tồn tại`)
          g.edges = g.edges.filter((x) => x.id !== op.id)
          break
        }
        case 'add_note': {
          const targetIds = op.targets.map((t) => need(t, 'target'))
          g.notes.push({ id: newId('note'), text: op.text, author: 'ai', targetIds, kind: op.kind })
          break
        }
      }
      ok.push(op)
    } catch (e) {
      errors.push({ index, op, reason: (e as Error).message })
    }
  })
  return { graph: g, idMap, ok, errors }
}

export function validateOps(g: Graph, ops: Op[]): { ok: Op[]; errors: OpError[] } {
  let i = 0
  const { ok, errors } = simulate(g, ops, (t) => (t === 'edge' || t === 'note' ? `__${t}${++i}` : t))
  return { ok, errors }
}

export function applyOps(
  g: Graph,
  ops: Op[],
  newId: () => string,
): { graph: Graph; idMap: Record<string, string>; errors: OpError[] } {
  const { graph, idMap, errors } = simulate(g, ops, () => newId())
  return { graph, idMap, errors }
}
