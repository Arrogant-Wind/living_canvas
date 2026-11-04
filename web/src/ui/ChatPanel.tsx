import { useEffect, useRef, useState } from 'react'
import type { ChatMsg } from '../api'

export const TAGS = [
  { tag: '/review', hint: 'soát lỗi logic, dữ liệu không khớp' },
  { tag: '/expand', hint: 'bung node đang chọn thành các bước' },
  { tag: '/suggest', hint: 'đề xuất sửa sơ đồ' },
  { tag: '/explain', hint: 'giải thích node đang chọn' },
]

export function ChatPanel(props: {
  messages: ChatMsg[]
  selection: { id: string; title: string }[]
  busy: boolean
  onSend: (text: string) => void
}) {
  const { messages, selection, busy, onSend } = props
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight)
  }, [messages, busy])

  const showTags = text.startsWith('/') && !text.includes(' ')
  const send = () => {
    if (!text.trim() || busy) return
    onSend(text.trim())
    setText('')
  }

  return (
    <aside className="lc-chat">
      <div className="lc-chat-head">Chat với AI</div>
      <div className="lc-chat-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="lc-chat-empty">
            Mô tả workflow, chọn node rồi nhờ AI. Gõ <b>/</b> để xem lệnh.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`lc-msg lc-msg-${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="lc-msg lc-msg-ai lc-thinking">AI đang nghĩ…</div>}
      </div>
      <div className="lc-chat-input">
        {selection.length > 0 && (
          <div className="lc-chips">
            {selection.map((s) => (
              <span key={s.id} className="lc-chip">
                {s.title}
              </span>
            ))}
          </div>
        )}
        {showTags && (
          <div className="lc-tags">
            {TAGS.filter((t) => t.tag.startsWith(text)).map((t) => (
              <button key={t.tag} onClick={() => setText(`${t.tag} `)}>
                <b>{t.tag}</b> {t.hint}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={text}
          rows={3}
          placeholder="Nhắn cho AI… (Enter để gửi, Shift+Enter xuống dòng)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button disabled={busy || !text.trim()} onClick={send}>
          Gửi
        </button>
      </div>
    </aside>
  )
}
