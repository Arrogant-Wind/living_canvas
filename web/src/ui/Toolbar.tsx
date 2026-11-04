import { useContext } from 'react'
import { createShapeId, toRichText, useEditor, useValue } from 'tldraw'
import { tidyScopeForSelection } from '../canvas/tidyEditor'
import { TidyContext } from './Tidy'
import { graphId, WF_NODE } from '../canvas/storeToGraph'
import { MIN_H, type WfNodeShape } from '../canvas/WfNodeShape'

const KINDS = ['unknown', 'agent', 'llm', 'code', 'human'] as const

export function Toolbar() {
  const editor = useEditor()
  const tidy = useContext(TidyContext)
  const selected = useValue(
    'selected wf-nodes',
    () => editor.getSelectedShapes().filter((s): s is WfNodeShape => s.type === WF_NODE && !s.meta.ghost),
    [editor],
  )

  const addNode = (container: boolean) => {
    const c = editor.getViewportPageBounds().center
    const id = createShapeId()
    const w = container ? 420 : 200
    const h = container ? 260 : MIN_H
    editor.createShape<WfNodeShape>({
      id,
      type: WF_NODE,
      x: c.x - w / 2,
      y: c.y - h / 2,
      props: { w, h, container, title: container ? 'Khung mới' : 'Bước mới' },
    })
    editor.select(id)
  }

  const addComment = () => {
    const targets = selected.map((s) => graphId(s.id))
    const b = editor.getSelectionPageBounds()
    editor.createShape({
      id: createShapeId(),
      type: 'note',
      x: (b?.maxX ?? 0) + 40,
      y: (b?.minY ?? 0) - 40,
      props: { richText: toRichText(''), color: 'yellow', size: 's' },
      meta: { author: 'user', kind: 'comment', targetIds: targets },
    })
  }

  const one = selected.length === 1 ? selected[0] : null
  const set = (props: Partial<WfNodeShape['props']>) =>
    one && editor.updateShape<WfNodeShape>({ id: one.id, type: WF_NODE, props })

  return (
    <div className="lc-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={() => addNode(false)}>+ Bước</button>
      <button onClick={() => addNode(true)}>+ Khung</button>
      <button disabled={!selected.length} onClick={addComment} title="Tạo note ghim vào các node đang chọn">
        💬 Comment
      </button>
      <button
        onClick={() => tidy.start(tidyScopeForSelection(editor))}
        title="Xếp lại theo luồng: khung đang chọn (hoặc khung chứa ô đang chọn), không chọn gì thì cả sơ đồ"
      >
        ⇄ Sắp xếp lại
      </button>
      {one && (
        <div className="lc-inspector">
          <label>
            Tên
            <input value={one.props.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label>
            Loại
            <select value={one.props.kind} onChange={(e) => set({ kind: e.target.value as WfNodeShape['props']['kind'] })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === 'unknown' ? '?' : k}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nhận vào
            <input value={one.props.inputs} placeholder="a, b" onChange={(e) => set({ inputs: e.target.value })} />
          </label>
          <label>
            Trả ra
            <input value={one.props.outputs} placeholder="x, y" onChange={(e) => set({ outputs: e.target.value })} />
          </label>
          <label>
            Schema vào (JSON, không bắt buộc)
            <textarea className="lc-mono" value={one.props.inputSchema ?? ''} rows={2} onChange={(e) => set({ inputSchema: e.target.value })} />
          </label>
          <label>
            Schema ra (JSON, không bắt buộc)
            <textarea className="lc-mono" value={one.props.outputSchema ?? ''} rows={2} onChange={(e) => set({ outputSchema: e.target.value })} />
          </label>
          <label>
            Mô tả
            <textarea value={one.props.description} rows={2} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <label className="lc-check">
            <input type="checkbox" checked={one.props.container} onChange={(e) => set({ container: e.target.checked })} />
            Là khung (chứa bước con)
          </label>
        </div>
      )}
    </div>
  )
}
