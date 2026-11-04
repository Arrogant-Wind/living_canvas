import type { Graph } from '@lc/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Tldraw, useValue, type Editor } from 'tldraw'
import { api, type ChatMsg } from './api'
import { graphId, WF_NODE } from './canvas/storeToGraph'
import { WfNodeShapeUtil } from './canvas/WfNodeShape'
import { currentGraph, useProposal } from './proposal/useProposal'
import { ChatPanel } from './ui/ChatPanel'
import { ProposalBar } from './ui/ProposalBar'
import { Toolbar } from './ui/Toolbar'

const shapeUtils = [WfNodeShapeUtil]
const project = new URLSearchParams(location.search).get('p') ?? 'demo'

/** Snapshot cũ có thể còn ghost (lưu khi đang chờ duyệt): xóa đi khi mở lại. */
function stripGhosts(editor: Editor) {
  editor.run(
    () => {
      const shapes = editor.getCurrentPageShapes()
      editor.deleteShapes(shapes.filter((s) => s.meta.ghost).map((s) => s.id))
      for (const s of shapes)
        if (s.meta.pendingOp) editor.updateShape({ id: s.id, type: s.type, meta: { pendingOp: null } } as any)
    },
    { history: 'ignore' },
  )
}

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const prevGraph = useRef<Graph | undefined>(undefined)
  const { proposal, propose, accept, reject } = useProposal(editor)

  // Tải project, rồi tự lưu (debounce 800ms) mỗi khi tài liệu đổi.
  useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let stop: (() => void) | undefined
    let alive = true
    ;(async () => {
      const [{ snapshot }, { messages }] = await Promise.all([api.loadCanvas(project), api.loadChat(project)])
      if (!alive) return
      if (snapshot) editor.loadSnapshot({ document: snapshot as any })
      stripGhosts(editor)
      setMessages(messages)
      stop = editor.store.listen(
        () => {
          clearTimeout(timer)
          timer = setTimeout(() => api.saveCanvas(project, editor.getSnapshot().document).catch(console.error), 800)
        },
        { scope: 'document' },
      )
    })().catch((e) => setMessages([{ role: 'error', text: `Không tải được project: ${e.message}` }]))
    return () => {
      alive = false
      stop?.()
      clearTimeout(timer)
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
        <Tldraw
          shapeUtils={shapeUtils}
          components={{ InFrontOfTheCanvas: Toolbar }}
          onMount={(e) => {
            ;(window as any).editor = e
            setEditor(e)
          }}
        />
        {proposal && <ProposalBar key={proposal.id} proposal={proposal} onAccept={onAccept} onReject={reject} />}
      </div>
      <ChatPanel messages={messages} selection={selection} busy={busy} onSend={send} />
    </div>
  )
}
