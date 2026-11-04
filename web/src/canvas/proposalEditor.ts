import type { Op } from '@lc/shared'
import type { Editor, TLShapeId } from 'tldraw'
import type { BindingCreate, Proposal, ShapeCreate, ShapeId } from './applyProposal'
import { plainToRichText } from './applyProposal'
import { WF_NODE } from './storeToGraph'

/** Proposal đã mount: giữ bản tạo để dựng lại thành shape thật khi nhận. */
export interface MountedProposal extends Proposal {
  create: ShapeCreate[]
  bindings: BindingCreate[]
}

const ghostCreates = (p: MountedProposal) => p.create.filter((c) => c.meta.ghost)

/** Vẽ ghost lên canvas. Không vào lịch sử undo. Note review của AI tạo thật luôn (có undo). */
export function mountProposal(editor: Editor, p: MountedProposal) {
  const notes = p.create.filter((c) => !c.meta.ghost)
  if (notes.length) editor.createShapes(notes as any)
  editor.run(
    () => {
      editor.createShapes(ghostCreates(p) as any)
      editor.createBindings(p.bindings.filter((b) => editor.getShape(b.toId as TLShapeId)) as any)
      for (const it of p.items)
        for (const id of it.ops.length ? it.shapeIds : [])
          if (editor.getShape(id as TLShapeId))
            editor.updateShape({ id: id as TLShapeId, type: editor.getShape(id as TLShapeId)!.type, meta: { pendingOp: p.id } } as any)
    },
    { history: 'ignore' },
  )
}

function clear(editor: Editor, p: MountedProposal) {
  editor.run(
    () => {
      const ghosts = ghostCreates(p).map((c) => c.id as TLShapeId).filter((id) => editor.getShape(id))
      editor.deleteShapes(ghosts)
      for (const s of editor.getCurrentPageShapes())
        // updateShape gộp meta với giá trị cũ: phải gán null mới xóa được.
        if (s.meta.pendingOp === p.id) editor.updateShape({ id: s.id, type: s.type, meta: { pendingOp: null } } as any)
    },
    { history: 'ignore' },
  )
}

export function rejectProposal(editor: Editor, p: MountedProposal) {
  clear(editor, p)
}

/**
 * Nhận các mục được chọn (mặc định: tất cả). Ghost bị xóa (không vào undo), rồi dựng lại
 * phần được nhận thành shape thật trong một mục undo. Trả về nhãn các mục bị bỏ vì đích
 * không còn tồn tại.
 */
export function acceptProposal(editor: Editor, p: MountedProposal, keys?: string[]): string[] {
  const chosen = p.items.filter((it) => (keys ? keys.includes(it.key) : true))
  const keepIds = new Set<ShapeId>(chosen.filter((it) => !it.ops.length).flatMap((it) => it.shapeIds))
  clear(editor, p)
  const skipped: string[] = []

  editor.markHistoryStoppingPoint(`accept ${p.id}`)
  editor.run(() => {
    const nodes = ghostCreates(p).filter((c) => keepIds.has(c.id) && c.type === WF_NODE)
    const okNode = (id: ShapeId) => !!editor.getShape(id as TLShapeId)
    // Node trước (cha trước con), sau đó mũi tên có đủ hai đầu.
    const ordered = [...nodes].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0))
    for (const c of ordered) {
      const { ghost: _, ...meta } = c.meta
      if (c.parentId && !okNode(c.parentId)) {
        const { parentId: _p, ...rest } = c
        editor.createShape({ ...rest, meta } as any)
      } else editor.createShape({ ...c, meta } as any)
    }
    for (const c of ghostCreates(p).filter((c) => keepIds.has(c.id) && c.type === 'arrow')) {
      const bs = p.bindings.filter((b) => b.fromId === c.id)
      if (!bs.every((b) => okNode(b.toId))) continue
      const { ghost: _, ...meta } = c.meta
      editor.createShape({ ...c, meta } as any)
      editor.createBindings(bs as any)
    }
    for (const it of chosen)
      for (const op of it.ops) if (!applyExistingOp(editor, op)) skipped.push(it.label)
  })
  return skipped
}

/** Con mới chuyển vào khung: nếu nằm ngoài khung thì đặt vào ô trống kế tiếp và nới khung. */
function fitChildInside(editor: Editor, childId: TLShapeId, parentId: TLShapeId) {
  const parent = editor.getShape(parentId)!
  const pp = parent.props as any
  const child = editor.getShape(childId)!
  const cp = child.props as any
  const inside = child.x >= 0 && child.y >= 0 && child.x + cp.w <= pp.w && child.y + cp.h <= pp.h
  if (inside) return
  const siblings = editor.getSortedChildIdsForParent(parentId).filter((id) => id !== childId).map((id) => editor.getShape(id)!)
  const PAD = 20
  const bottom = siblings.reduce((m, s) => Math.max(m, s.y + ((s.props as any).h ?? 0)), 30)
  const x = PAD
  const y = bottom + PAD
  editor.updateShape({ id: childId, type: child.type, x, y } as any)
  editor.updateShape({
    id: parentId,
    type: WF_NODE,
    props: { w: Math.max(pp.w, x + cp.w + PAD), h: Math.max(pp.h, y + cp.h + PAD) },
  } as any)
}

function applyExistingOp(editor: Editor, op: Op): boolean {
  const get = (id: string) => editor.getShape(`shape:${id}` as TLShapeId)
  switch (op.op) {
    case 'update_node': {
      const s = get(op.id)
      if (!s || s.type !== WF_NODE) return false
      const props: Record<string, unknown> = {}
      if (op.title !== undefined) props.title = op.title
      if (op.kind !== undefined) props.kind = op.kind
      if (op.inputs !== undefined) props.inputs = op.inputs.join(', ')
      if (op.outputs !== undefined) props.outputs = op.outputs.join(', ')
      if (op.description !== undefined) props.description = op.description
      editor.updateShape({ id: s.id, type: WF_NODE, props } as any)
      return true
    }
    case 'delete_node':
    case 'delete_edge': {
      const s = get(op.id)
      if (!s) return false
      editor.deleteShapes([s.id])
      return true
    }
    case 'set_parent': {
      const s = get(op.id)
      if (!s) return false
      if (op.parent === null) {
        editor.reparentShapes([s.id], editor.getCurrentPageId())
        return true
      }
      const parent = get(op.parent)
      if (!parent) return false
      if (parent.type === WF_NODE && !(parent.props as any).container)
        editor.updateShape({ id: parent.id, type: WF_NODE, props: { container: true } } as any)
      editor.reparentShapes([s.id], parent.id)
      fitChildInside(editor, s.id, parent.id)
      return true
    }
    case 'update_edge': {
      const s = get(op.id)
      if (!s || s.type !== 'arrow') return false
      if (op.label !== undefined) editor.updateShape({ id: s.id, type: 'arrow', props: { richText: plainToRichText(op.label) } } as any)
      return true
    }
    default:
      return true
  }
}
