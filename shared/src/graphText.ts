import type { Graph, GraphEdge, GraphNode } from './ir'

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

export function nodeLine(n: GraphNode): string {
  const parts = [n.id, n.title, `kind=${n.kind ?? '?'}`]
  if (n.parentId) parts.push(`parent=${n.parentId}`)
  if (n.inputs?.length) parts.push(`in: ${n.inputs.join(', ')}`)
  if (n.outputs?.length) parts.push(`out: ${n.outputs.join(', ')}`)
  if (n.inputSchema) parts.push(`in_schema: ${oneLine(n.inputSchema)}`)
  if (n.outputSchema) parts.push(`out_schema: ${oneLine(n.outputSchema)}`)
  if (n.description) parts.push(`desc: ${oneLine(n.description)}`)
  return parts.join(' | ')
}

/** `e1: a -[nhãn]-> b`. Có id để model sửa hoặc xóa được cạnh. */
export function edgeLine(e: GraphEdge): string {
  if (e.type === 'data') return `${e.id}: ${e.from} ..[${e.label ?? ''}]..> ${e.to}        (data edge)`
  return e.label ? `${e.id}: ${e.from} -[${e.label}]-> ${e.to}` : `${e.id}: ${e.from} --> ${e.to}`
}

function childrenOf(g: Graph): Map<string, GraphNode[]> {
  const children = new Map<string, GraphNode[]>()
  for (const n of g.nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n])
  return children
}

/** In các cây có gốc `roots`, node con thụt 2 dấu cách dưới cha. */
function treeLines(roots: GraphNode[], children: Map<string, GraphNode[]>): string[] {
  const out: string[] = []
  const walk = (n: GraphNode, depth: number) => {
    out.push('  '.repeat(depth) + nodeLine(n))
    for (const c of children.get(n.id) ?? []) walk(c, depth + 1)
  }
  roots.forEach((n) => walk(n, 0))
  return out
}

function noteLines(notes: Graph['notes']): string[] {
  return notes.map((c) => {
    const on = c.targetIds.length ? ` on ${c.targetIds.join(', ')}` : ''
    return `${c.id} (${c.author}, ${c.kind})${on}: "${c.text}"`
  })
}

/** In IR thành text gọn cho model đọc. Node con thụt 2 dấu cách dưới cha. */
export function graphToText(g: Graph): string {
  const out = ['NODES']
  const ids = new Set(g.nodes.map((n) => n.id))
  const roots = g.nodes.filter((n) => !n.parentId || !ids.has(n.parentId))
  out.push(...treeLines(roots, childrenOf(g)))
  if (g.nodes.length === 0) out.push('(trống)')

  out.push('EDGES')
  out.push(...(g.edges.length ? g.edges.map(edgeLine) : ['(trống)']))

  if (g.notes.length) out.push('NOTES', ...noteLines(g.notes))
  return out.join('\n')
}

/**
 * In nhóm node người dùng đính kèm vào lượt chat: các node đó (kèm node con nếu là khung),
 * cạnh nằm trong nhóm, cạnh nối nhóm với bên ngoài và note ghim vào nhóm.
 */
export function refToText(g: Graph, refIds: string[]): string {
  const children = childrenOf(g)
  const inGroup = new Set<string>()
  const add = (id: string) => {
    if (inGroup.has(id)) return
    inGroup.add(id)
    for (const c of children.get(id) ?? []) add(c.id)
  }
  for (const id of refIds) if (g.nodes.some((n) => n.id === id)) add(id)
  if (!inGroup.size) return ''

  // Gốc là node trong nhóm mà cha không trong nhóm; node con được in dưới cha.
  const roots = g.nodes.filter((n) => inGroup.has(n.id) && !(n.parentId && inGroup.has(n.parentId)))
  const out = ['NODES TRONG NHÓM', ...treeLines(roots, children)]
  const inner = g.edges.filter((e) => inGroup.has(e.from) && inGroup.has(e.to))
  const boundary = g.edges.filter((e) => inGroup.has(e.from) !== inGroup.has(e.to))
  if (inner.length) out.push('CẠNH TRONG NHÓM', ...inner.map(edgeLine))
  if (boundary.length) out.push('CẠNH VÀO / RA NHÓM', ...boundary.map(edgeLine))
  const notes = g.notes.filter((c) => c.targetIds.some((t) => inGroup.has(t)))
  if (notes.length) out.push('NOTES', ...noteLines(notes))
  return out.join('\n')
}
