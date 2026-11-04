import { edgeLine, nodeLine } from './graphText'
import type { Graph } from './ir'

export interface GraphDiff {
  addedNodes: string[]
  removedNodes: string[]
  changedNodes: string[]
  addedEdges: string[]
  removedEdges: string[]
  addedNotes: string[]
}

const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]))

export function diffGraphs(prev: Graph, next: Graph): GraphDiff {
  const pn = byId(prev.nodes)
  const nn = byId(next.nodes)
  const pe = byId(prev.edges)
  const ne = byId(next.edges)
  const pc = byId(prev.notes)
  return {
    addedNodes: next.nodes.filter((n) => !pn.has(n.id)).map((n) => n.id),
    removedNodes: prev.nodes.filter((n) => !nn.has(n.id)).map((n) => n.id),
    changedNodes: next.nodes
      .filter((n) => pn.has(n.id) && JSON.stringify(pn.get(n.id)) !== JSON.stringify(n))
      .map((n) => n.id),
    addedEdges: next.edges.filter((e) => !pe.has(e.id)).map((e) => e.id),
    removedEdges: prev.edges.filter((e) => !ne.has(e.id)).map((e) => e.id),
    addedNotes: next.notes.filter((c) => !pc.has(c.id)).map((c) => c.id),
  }
}

export function diffToText(d: GraphDiff, next: Graph, prev: Graph): string {
  const nn = byId(next.nodes)
  const pn = byId(prev.nodes)
  const ne = byId(next.edges)
  const pe = byId(prev.edges)
  const nc = byId(next.notes)
  const out: string[] = []
  d.addedNodes.forEach((id) => out.push(`+ node ${nodeLine(nn.get(id)!)}`))
  d.changedNodes.forEach((id) => out.push(`~ node ${nodeLine(nn.get(id)!)} (trước: ${pn.get(id)!.title})`))
  d.removedNodes.forEach((id) => out.push(`- node ${id} | ${pn.get(id)!.title}`))
  d.addedEdges.forEach((id) => out.push(`+ edge ${edgeLine(ne.get(id)!)}`))
  d.removedEdges.forEach((id) => out.push(`- edge ${edgeLine(pe.get(id)!)}`))
  d.addedNotes.forEach((id) => out.push(`+ note ${id}: "${nc.get(id)!.text}"`))
  return out.length ? out.join('\n') : '(không đổi)'
}
