import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pushAside, type Box, type Graph } from '@lc/shared'
import {
  ArrowBindingUtil,
  ArrowShapeKindStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  Tldraw,
  useValue,
  type BindingOnShapeDeleteOptions,
  type Editor,
  type TLArrowBinding,
  type TLShapeId,
} from 'tldraw'
import { api, type ChatMsg } from './api'
import { createAutosaver, type SaveStatus } from './autosave'
import { graphId, WF_NODE } from './canvas/storeToGraph'
import { WfNodeShapeUtil } from './canvas/WfNodeShape'
import { currentGraph, useProposal } from './proposal/useProposal'
import { ChatPanel } from './ui/ChatPanel'
import { ProposalBar } from './ui/ProposalBar'
import { rejectTidy, startTidy, type TidyPreview } from './canvas/tidyEditor'
import { HoverCard } from './ui/HoverCard'
import { ClutterHints, TidyBar, TidyContext } from './ui/Tidy'
import { Toolbar } from './ui/Toolbar'

const shapeUtils = [WfNodeShapeUtil]

/** Xóa ô thì xóa luôn mũi tên nối vào nó, không để mũi tên lơ lửng. */
class WfArrowBindingUtil extends ArrowBindingUtil {
  override onBeforeDeleteToShape({ binding, shape }: BindingOnShapeDeleteOptions<TLArrowBinding>) {
    if (shape.type === WF_NODE && this.editor.getShape(binding.fromId)) this.editor.deleteShapes([binding.fromId])
  }
}
const bindingUtils = [WfArrowBindingUtil]

function Overlay() {
  return (
    <>
      <Toolbar />
      <HoverCard />
      <ClutterHints />
    </>
  )
}
// Bảng style mặc định của tldraw che góc phải canvas mà workflow không cần.
const components = { InFrontOfTheCanvas: Overlay, StylePanel: null }

/** Quy ước riêng của canvas workflow. */
function setupWorkflowCanvas(editor: Editor) {
  // Mũi tên người dùng vẽ cũng là mũi tên gấp khúc bám vào cạnh ô, như mũi tên AI tạo.
  editor.setStyleForNextShapes(ArrowShapeKindStyle, 'elbow')
  // Nhãn mũi tên font thường cỡ nhỏ: font vẽ tay cỡ M chiếm gấp đôi chỗ và dễ đè nhau.
  editor.setStyleForNextShapes(DefaultSizeStyle, 's')
  editor.setStyleForNextShapes(DefaultFontStyle, 'sans')
  // Khung (ở cấp trang) to ra thì đẩy các ô bên phải / bên dưới ra, không để khung đè lên chúng.
  editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
    if (next.type !== WF_NODE || next.parentId !== editor.getCurrentPageId() || !(next.props as any).container) return
    // Undo/redo/bail phát lại cả việc đẩy đã ghi; đẩy thêm lần nữa sẽ đẩy gấp đôi.
    // (`history` là protected trong tldraw 5; 'paused' = đang undo/redo hoặc ghi với history: 'ignore'.)
    if ((editor as any).history?.state === 'paused') return
    const a = prev.props as any
    const b = next.props as any
    if (b.w <= a.w && b.h <= a.h) return
    const boxes: Record<string, Box> = {}
    for (const s of editor.getCurrentPageShapes()) {
      if (s.parentId !== editor.getCurrentPageId() || s.type === 'arrow') continue
      const bb = editor.getShapePageBounds(s.id)
      if (bb) boxes[s.id] = { x: bb.x, y: bb.y, w: bb.w, h: bb.h }
    }
    boxes[next.id] = { x: next.x, y: next.y, w: b.w, h: b.h }
    const shift = pushAside(boxes, next.id, { x: prev.x, y: prev.y, w: a.w, h: a.h })
    const updates = Object.entries(shift).map(([id, d]) => {
      const s = editor.getShape(id as TLShapeId)!
      return { id: s.id, type: s.type, x: s.x + d.dx, y: s.y + d.dy }
    })
    if (updates.length) editor.updateShapes(updates as any)
  })
}
const project = new URLSearchParams(location.search).get('p') ?? 'demo'

/** Snapshot cũ có thể còn ghost (lưu khi đang chờ duyệt): xóa đi khi mở lại. */
function stripGhosts(editor: Editor) {
  editor.run(
    () => {
      const shapes = editor.getCurrentPageShapes()
      editor.deleteShapes(shapes.filter((s) => s.meta.ghost).map((s) => s.id))
      for (const s of shapes)
        if (s.meta.pendingOp) editor.updateShape({ id: s.id, type: s.type, meta: { pendingOp: null } } as any)
      // Mũi tên cũ (vẽ trước khi có quy ước nhãn nhỏ) cũng đổi sang cỡ s, font thường.
      for (const s of shapes)
        if (s.type === 'arrow' && ((s.props as any).size !== 's' || (s.props as any).font !== 'sans'))
          editor.updateShape({ id: s.id, type: 'arrow', props: { size: 's', font: 'sans' } } as any)
    },
    { history: 'ignore' },
  )
}

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('pending')
  const prevGraph = useRef<Graph | undefined>(undefined)
  const { proposal, propose, accept, reject } = useProposal(editor)
  const [tidyPreview, setTidyPreview] = useState<TidyPreview | null>(null)

  const startTidyAt = useCallback(
    (scope: string | null) => {
      if (!editor) return
      reject() // ghost của đề xuất AI sẽ lệch chỗ nếu xếp lại bên dưới nó
      if (tidyPreview) setTidyPreview(null) // lần trước coi như đã giữ
      setTidyPreview(startTidy(editor, scope))
    },
    [editor, reject, tidyPreview],
  )
  const tidyApi = useMemo(() => ({ preview: tidyPreview, start: startTidyAt }), [tidyPreview, startTidyAt])

  // Đang xem trước mà người dùng bắt đầu thao tác trên canvas thì coi như giữ kết quả.
  useEffect(() => {
    if (!editor || !tidyPreview) return
    const onEvent = (info: { name: string }) => info.name === 'pointer_down' && setTidyPreview(null)
    editor.on('event', onEvent as any)
    return () => {
      editor.off('event', onEvent as any)
    }
  }, [editor, tidyPreview])

  // Tải project, rồi tự lưu (debounce 800ms, thử lại mỗi 5s khi lỗi, lưu ngay khi đóng tab).
  useEffect(() => {
    if (!editor) return
    let stop: (() => void) | undefined
    let alive = true
    const saver = createAutosaver({
      save: (doc: unknown) => api.saveCanvas(project, doc),
      delayMs: 800,
      retryMs: 5000,
      onStatus: setSaveStatus,
    })
    const flush = () => saver.flush()
    ;(async () => {
      const [{ snapshot }, { messages }] = await Promise.all([api.loadCanvas(project), api.loadChat(project)])
      if (!alive) return
      if (snapshot) editor.loadSnapshot({ document: snapshot as any })
      stripGhosts(editor)
      setMessages(messages)
      setSaveStatus('saved')
      stop = editor.store.listen(() => saver.schedule(() => editor.getSnapshot().document), { scope: 'document' })
      window.addEventListener('pagehide', flush)
    })().catch((e) => {
      // Không tải được thì khóa canvas: lưu lúc này sẽ ghi đè dữ liệu thật bằng canvas trống.
      editor.updateInstanceState({ isReadonly: true })
      setSaveStatus('error')
      setMessages([{ role: 'error', text: `Không tải được project (${e.message}). Canvas đang khóa, tải lại trang để thử lại.` }])
    })
    return () => {
      alive = false
      stop?.()
      saver.flush()
      saver.dispose()
      window.removeEventListener('pagehide', flush)
    }
  }, [editor])

  const selection = useValue(
    'selection',
    () =>
      editor
        ? editor
            .getSelectedShapes()
            .filter((s) => s.type === WF_NODE && !s.meta.ghost)
            .map((s) => ({ id: graphId(s.id), title: (s.props as any).title as string }))
        : [],
    [editor],
  )

  const send = useCallback(
    async (text: string) => {
      if (!editor) return
      reject()
      setMessages((m) => [...m, { role: 'user', text }])
      setBusy(true)
      const graph = currentGraph(editor)
      try {
        const r = await api.ask(project, { graph, prevGraph: prevGraph.current, selection: selection.map((s) => s.id), message: text })
        prevGraph.current = graph
        const bad = (await propose(r.reply, r.ops)) + r.dropped.length
        setMessages((m) => [
          ...m,
          { role: 'ai', text: r.reply },
          ...(bad ? [{ role: 'error' as const, text: `Bỏ ${bad} đề xuất không hợp lệ.` }] : []),
        ])
      } catch (e) {
        setMessages((m) => [...m, { role: 'error', text: (e as Error).message }])
      } finally {
        setBusy(false)
      }
    },
    [editor, propose, reject, selection],
  )

  const onAccept = (keys?: string[]) => {
    const skipped = accept(keys)
    if (skipped.length)
      setMessages((m) => [...m, { role: 'error', text: `Bỏ qua vì node không còn: ${skipped.join('; ')}` }])
  }

  return (
    <div className="lc-app">
      <div className="lc-canvas">
        <TidyContext.Provider value={tidyApi}>
        <Tldraw
          shapeUtils={shapeUtils}
          bindingUtils={bindingUtils}
          components={components}
          onMount={(e) => {
            ;(window as any).editor = e
            setupWorkflowCanvas(e)
            setEditor(e)
          }}
        />
        </TidyContext.Provider>
        {proposal && <ProposalBar key={proposal.id} proposal={proposal} onAccept={onAccept} onReject={reject} />}
        {tidyPreview && !proposal && (
          <TidyBar
            preview={tidyPreview}
            onAccept={() => setTidyPreview(null)}
            onReject={() => {
              if (editor) rejectTidy(editor, tidyPreview)
              setTidyPreview(null)
            }}
          />
        )}
      </div>
      <ChatPanel messages={messages} selection={selection} busy={busy} onSend={send} saveStatus={saveStatus} />
    </div>
  )
}
