import type { Graph, GraphEdge, GraphNode } from './ir'

export function nodeLine(n: GraphNode): string {
  const parts = [n.id, n.title, `kind=${n.kind ?? '?'}`]
  if (n.parentId) parts.push(`parent=${n.parentId}`)
  if (n.inputs?.length) parts.push(`in: ${n.inputs.join(', ')}`)
  if (n.outputs?.length) parts.push(`out: ${n.outputs.join(', ')}`)
  if (n.description) parts.push(`desc: ${n.description}`)
  return parts.join(' | ')
}

/** `e1: a -[nhãn]-> b`. Có id để model sửa hoặc xóa được cạnh. */
export function edgeLine(e: GraphEdge): string {
  if (e.type === 'data') return `${e.id}: ${e.from} ..[${e.label ?? ''}]..> ${e.to}        (data edge)`
  return e.label ? `${e.id}: ${e.from} -[${e.label}]-> ${e.to}` : `${e.id}: ${e.from} --> ${e.to}`
}

/** In IR thành text gọn cho model đọc. Node con thụt 2 dấu cách dưới cha. */
export function graphToText(g: Graph): string {
  const out = ['NODES']
  const ids = new Set(g.nodes.map((n) => n.id))
  const children = new Map<string, GraphNode[]>()
  const roots: GraphNode[] = []
  for (const n of g.nodes) {
    if (n.parentId && ids.has(n.parentId)) {
      children.set(n.parentId, [...(children.get(n.parentId) ?? []), n])
    } else roots.push(n)
  }
  const walk = (n: GraphNode, depth: number) => {
    out.push('  '.repeat(depth) + nodeLine(n))
    for (const c of children.get(n.id) ?? []) walk(c, depth + 1)
  }
  roots.forEach((n) => walk(n, 0))
  if (g.nodes.length === 0) out.push('(trống)')

  out.push('EDGES')
  out.push(...(g.edges.length ? g.edges.map(edgeLine) : ['(trống)']))

  if (g.notes.length) {
    out.push('NOTES')
    for (const c of g.notes) {
      const on = c.targetIds.length ? ` on ${c.targetIds.join(', ')}` : ''
      out.push(`${c.id} (${c.author}, ${c.kind})${on}: "${c.text}"`)
    }
  }
  return out.join('\n')
}
