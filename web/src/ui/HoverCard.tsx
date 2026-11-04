import { useEditor, useValue } from 'tldraw'
import { WF_NODE } from '../canvas/storeToGraph'
import type { WfNodeShape } from '../canvas/WfNodeShape'

/** JSON đẹp nếu parse được, không thì giữ nguyên chữ. */
const pretty = (s: string) => {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

/** Thẻ chi tiết của ô đang hover: input, output, schema, mô tả. */
export function HoverCard() {
  const editor = useEditor()
  const info = useValue(
    'hover card',
    () => {
      const id = editor.getHoveredShapeId()
      const s = id && editor.getShape(id)
      if (!s || s.type !== WF_NODE || editor.getEditingShapeId() === s.id) return null
      if (editor.isInAny('select.translating', 'select.resizing', 'select.dragging_handle')) return null
      const b = editor.getShapePageBounds(s.id)!
      const at = editor.pageToViewport({ x: b.maxX, y: b.minY })
      return { shape: s as WfNodeShape, x: at.x + 12, y: at.y }
    },
    [editor],
  )
  if (!info) return null
  const p = info.shape.props
  const empty = !p.inputs && !p.outputs && !p.inputSchema && !p.outputSchema && !p.description

  return (
    <div className="lc-hover" style={{ left: info.x, top: info.y }}>
      <div className="lc-hover-title">
        {p.title}
        {p.kind !== 'unknown' && <span className="lc-hover-kind">{p.kind}</span>}
      </div>
      {p.description && <p className="lc-hover-desc">{p.description}</p>}
      <Section label="Nhận vào" items={p.inputs} schema={p.inputSchema} />
      <Section label="Trả ra" items={p.outputs} schema={p.outputSchema} />
      {empty && <p className="lc-hover-empty">Chưa khai báo input/output. Chọn ô để sửa ở bảng bên trái.</p>}
    </div>
  )
}

function Section({ label, items, schema }: { label: string; items: string; schema?: string }) {
  if (!items && !schema) return null
  return (
    <div className="lc-hover-sec">
      <div className="lc-hover-label">{label}</div>
      {items && (
        <ul>
          {items
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
            .map((x) => (
              <li key={x}>{x}</li>
            ))}
        </ul>
      )}
      {schema && <pre>{pretty(schema)}</pre>}
    </div>
  )
}
