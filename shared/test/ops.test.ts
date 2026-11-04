import { describe, expect, it } from 'vitest'
import type { Op } from '../src/ir'
import { applyOps, validateOps } from '../src/ops'
import { historyGraph } from './fixtures'

const counter = () => {
  let i = 0
  return () => `g${++i}`
}

describe('validateOps / applyOps', () => {
  it('lets a later op reference a tempId from an earlier add_node', () => {
    const ops: Op[] = [
      { op: 'add_node', tempId: 't1', title: 'Gom cảnh → prompt' },
      { op: 'add_edge', from: 'n1', to: 't1', label: 'cảnh × N' },
    ]
    expect(validateOps(historyGraph(), ops).errors).toEqual([])
    const { graph, idMap, errors } = applyOps(historyGraph(), ops, counter())
    expect(errors).toEqual([])
    expect(idMap.t1).toBe('g1')
    expect(graph.nodes.find((n) => n.id === 'g1')?.title).toBe('Gom cảnh → prompt')
    const e = graph.edges.find((x) => x.to === 'g1')!
    expect(e).toMatchObject({ from: 'n1', label: 'cảnh × N', type: 'flow' })
  })

  it('reports unknown ids by name', () => {
    const { errors } = validateOps(historyGraph(), [{ op: 'update_node', id: 'zzz', title: 'x' }])
    expect(errors[0].reason).toContain('zzz')
  })

  it('rejects a parent cycle', () => {
    const { errors } = validateOps(historyGraph(), [{ op: 'set_parent', id: 'n2', parent: 'n5' }])
    expect(errors).toHaveLength(1)
  })

  it('rejects a node as its own parent', () => {
    const { errors } = validateOps(historyGraph(), [{ op: 'set_parent', id: 'n2', parent: 'n2' }])
    expect(errors).toHaveLength(1)
  })

  it('rejects a duplicate edge', () => {
    const { errors } = validateOps(historyGraph(), [{ op: 'add_edge', from: 'n1', to: 'n2' }])
    expect(errors).toHaveLength(1)
  })

  it('delete_node removes its edges, unparents children and drops note targets', () => {
    const { graph } = applyOps(historyGraph(), [{ op: 'delete_node', id: 'n2' }], counter())
    expect(graph.nodes.find((n) => n.id === 'n2')).toBeUndefined()
    expect(graph.edges.some((e) => e.from === 'n2' || e.to === 'n2')).toBe(false)
    expect(graph.nodes.find((n) => n.id === 'n5')?.parentId).toBeUndefined()
  })

  it('skips ops whose target was deleted but still applies the rest', () => {
    const g = historyGraph()
    g.nodes = g.nodes.filter((n) => n.id !== 'n4')
    g.edges = g.edges.filter((e) => e.to !== 'n4')
    const { graph, errors } = applyOps(
      g,
      [
        { op: 'update_node', id: 'n4', title: 'Generate' },
        { op: 'update_node', id: 'n3', title: 'Tạo bản đồ' },
      ],
      counter(),
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].index).toBe(0)
    expect(graph.nodes.find((n) => n.id === 'n3')?.title).toBe('Tạo bản đồ')
  })
})
