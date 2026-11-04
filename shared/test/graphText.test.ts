import { describe, expect, it } from 'vitest'
import { graphToText } from '../src/graphText'
import { historyGraph } from './fixtures'

describe('graphToText', () => {
  it('renders nodes, children, edges and notes in the fixed format', () => {
    expect(graphToText(historyGraph())).toBe(
      [
        'NODES',
        'n1 | Tìm hiểu dữ kiện | kind=agent | in: sự kiện | out: dữ kiện',
        'n2 | Chuẩn hóa | kind=? | in: dữ kiện | out: mốc + địa điểm',
        '  n5 | Nhân vật | kind=? | parent=n2',
        'n3 | Tạo map | kind=code',
        'n4 | Generate bằng API | kind=?',
        'EDGES',
        'e1: n1 -[dữ kiện]-> n2',
        'e2: n2 --> n3',
        'e3: n3 --> n4',
        'e4: n1 ..[facts]..> n3        (data edge)',
        'NOTES',
        'c1 (user, comment) on n4: "bước này còn mơ hồ quá"',
      ].join('\n'),
    )
  })

  it('marks an empty graph', () => {
    expect(graphToText({ nodes: [], edges: [], notes: [] })).toContain('NODES\n(trống)')
  })
})
