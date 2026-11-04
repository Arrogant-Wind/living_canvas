import type { Graph, GraphEdge, GraphNode, GraphNote, NodeKind } from '@lc/shared'

/** Bản rút gọn của record tldraw: chỉ các trường storeToGraph đọc. */
export interface LooseRecord {
  typeName: string
  id: string
  type?: string
  parentId?: string
  fromId?: string
  toId?: string
  meta?: Record<string, any>
  props?: Record<string, any>
}

export const WF_NODE = 'wf-node'

/** `shape:abc` → `abc`. */
export const graphId = (shapeId: string) => shapeId.replace(/^shape:/, '')

export const splitList = (s: string | undefined): string[] | undefined => {
  const xs = (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  return xs.length ? xs : undefined
}

export function richTextToPlain(rt: any): string {
  if (!rt) return ''
  if (typeof rt === 'string') return rt
  const walk = (n: any): string => (n.type === 'text' ? (n.text ?? '') : (n.content ?? []).map(walk).join(''))
  return (rt.content ?? []).map(walk).join('\n')
}

export function storeToGraph(records: LooseRecord[], opts: { includeGhosts?: boolean } = {}): Graph {
  const shapes = records.filter((r) => r.typeName === 'shape')
  const keep = (r: LooseRecord) => opts.includeGhosts || !r.meta?.ghost
  const wf = shapes.filter((s) => s.type === WF_NODE && keep(s))
  const wfIds = new Set(wf.map((s) => s.id))

  const nodes: GraphNode[] = wf.map((s) => {
    const p = s.props ?? {}
    const n: GraphNode = { id: graphId(s.id), title: p.title ?? '', status: s.meta?.locked ? 'locked' : 'draft' }
    if (p.kind && p.kind !== 'unknown') n.kind = p.kind as NodeKind
    if (s.parentId && wfIds.has(s.parentId)) n.parentId = graphId(s.parentId)
    const inputs = splitList(p.inputs)
    const outputs = splitList(p.outputs)
    if (inputs) n.inputs = inputs
    if (outputs) n.outputs = outputs
    if (p.description) n.description = p.description
    if (p.inputSchema) n.inputSchema = p.inputSchema
    if (p.outputSchema) n.outputSchema = p.outputSchema
    return n
  })

  const ends = new Map<string, { start?: string; end?: string }>()
  for (const b of records) {
    if (b.typeName !== 'binding' || b.type !== 'arrow' || !b.fromId || !b.toId) continue
    const e = ends.get(b.fromId) ?? {}
    e[b.props?.terminal as 'start' | 'end'] = b.toId
    ends.set(b.fromId, e)
  }
  const edges: GraphEdge[] = []
  for (const a of shapes) {
    if (a.type !== 'arrow' || !keep(a)) continue
    const e = ends.get(a.id)
    if (!e?.start || !e.end || !wfIds.has(e.start) || !wfIds.has(e.end)) continue
    const label = richTextToPlain(a.props?.richText).trim()
    edges.push({
      id: graphId(a.id),
      from: graphId(e.start),
      to: graphId(e.end),
      ...(label && { label }),
      type: a.meta?.edgeType === 'data' ? 'data' : 'flow',
    })
  }

  const notes: GraphNote[] = shapes
    .filter((s) => s.type === 'note' && keep(s))
    .map((s) => {
      const targetIds: string[] = (s.meta?.targetIds ?? []).filter((t: string) => wfIds.has(`shape:${t}`))
      return {
        id: graphId(s.id),
        text: richTextToPlain(s.props?.richText).trim(),
        author: s.meta?.author === 'ai' ? 'ai' : 'user',
        targetIds,
        kind: s.meta?.kind ?? (targetIds.length ? 'comment' : 'note'),
      }
    })

  return { nodes, edges, notes }
}
