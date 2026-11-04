import type { Graph } from '../src/ir'

/** Sơ đồ video lịch sử dùng chung cho các test. */
export function historyGraph(): Graph {
  return {
    nodes: [
      { id: 'n1', title: 'Tìm hiểu dữ kiện', kind: 'agent', inputs: ['sự kiện'], outputs: ['dữ kiện'], status: 'draft' },
      { id: 'n2', title: 'Chuẩn hóa', inputs: ['dữ kiện'], outputs: ['mốc + địa điểm'], status: 'draft' },
      { id: 'n5', title: 'Nhân vật', parentId: 'n2', status: 'draft' },
      { id: 'n3', title: 'Tạo map', kind: 'code', status: 'draft' },
      { id: 'n4', title: 'Generate bằng API', status: 'draft' },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', label: 'dữ kiện', type: 'flow' },
      { id: 'e2', from: 'n2', to: 'n3', type: 'flow' },
      { id: 'e3', from: 'n3', to: 'n4', type: 'flow' },
      { id: 'e4', from: 'n1', to: 'n3', label: 'facts', type: 'data' },
    ],
    notes: [{ id: 'c1', text: 'bước này còn mơ hồ quá', author: 'user', targetIds: ['n4'], kind: 'comment' }],
  }
}
