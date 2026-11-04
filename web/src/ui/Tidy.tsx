import { findClutter } from '@lc/shared'
import { createContext, useContext } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'
import { labelBoxes, noteBoxes, pageBoxes, type TidyPreview } from '../canvas/tidyEditor'
import { currentGraph } from '../proposal/useProposal'

export interface TidyApi {
  preview: TidyPreview | null
  start: (scope: string | null) => void
}
export const TidyContext = createContext<TidyApi>({ preview: null, start: () => {} })

/** Chip "N chỗ chồng chéo · Sắp xếp lại" đặt ngay tại khung bị rối (hoặc đầu canvas nếu ở cấp trang). */
export function ClutterHints() {
  const editor = useEditor()
  const { preview, start } = useContext(TidyContext)
  const hints = useValue(
    'clutter',
    () => {
      if (editor.isInAny('select.translating', 'select.resizing', 'select.dragging_handle')) return []
      const issues = findClutter(currentGraph(editor), pageBoxes(editor), {
        labels: labelBoxes(editor),
        notes: noteBoxes(editor),
      })
      const byScope = new Map<string | null, number>()
      for (const i of issues) byScope.set(i.scope, (byScope.get(i.scope) ?? 0) + 1)
      return [...byScope].map(([scope, count]) => {
        if (!scope) return { scope, count, x: null as number | null, y: null as number | null }
        const b = editor.getShapePageBounds(`shape:${scope}` as TLShapeId)
        const at = b ? editor.pageToViewport({ x: b.maxX, y: b.minY }) : null
        return { scope, count, x: at ? at.x : null, y: at ? at.y : null }
      })
    },
    [editor],
  )
  if (preview) return null
  return (
    <>
      {hints.map((h) => (
        <button
          key={h.scope ?? 'page'}
          className={`lc-clutter ${h.scope ? '' : 'lc-clutter-page'}`}
          style={h.x !== null ? { left: h.x, top: h.y! - 30, transform: 'translateX(-100%)' } : undefined}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => start(h.scope)}
          title="Xếp lại theo luồng, không đổi nội dung"
        >
          {h.count} chỗ chồng chéo · Sắp xếp lại
        </button>
      ))}
    </>
  )
}

export function TidyBar(props: { preview: TidyPreview; onAccept: () => void; onReject: () => void }) {
  return (
    <div className="lc-proposal" onPointerDown={(e) => e.stopPropagation()}>
      <div className="lc-proposal-title">Đã sắp xếp lại {props.preview.label}</div>
      <div className="lc-proposal-actions">
        <button className="lc-ok" onClick={props.onAccept}>
          Giữ
        </button>
        <button className="lc-no" onClick={props.onReject}>
          Hoàn tác
        </button>
      </div>
    </div>
  )
}
