import { useEffect, useRef, useState } from 'react'
import type { ChatMsg, ChatRef } from '../api'
import type { SaveStatus } from '../autosave'
import { AiBadge } from './AiBadge'

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: 'Đã lưu',
  pending: 'Chưa lưu…',
  saving: 'Đang lưu…',
  error: 'Chưa lưu được, đang thử lại',
}

export const TAGS = [
  { tag: '/review', hint: 'soát lỗi logic, dữ liệu không khớp' },
  { tag: '/expand', hint: 'bung node đính kèm thành các bước' },
  { tag: '/suggest', hint: 'đề xuất sửa sơ đồ' },
  { tag: '/explain', hint: 'giải thích node đính kèm' },
]

export function ChatPanel(props: {
  messages: ChatMsg[]
  attached: ChatRef[]
  /** Gỡ một node khỏi nhóm đính kèm; không truyền id thì gỡ cả nhóm. */
  onDetach: (id?: string) => void
  onFocusRefs: (refs: ChatRef[]) => void
  busy: boolean
  onSend: (text: string) => void
  saveStatus: SaveStatus
}) {
  const { messages, attached, onDetach, onFocusRefs, busy, onSend, saveStatus } = props
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
      <div className="lc-chat-head">
        <span className="lc-chat-title">
          Chat với AI
          <AiBadge busy={busy} />
        </span>
        <span className={`lc-save lc-save-${saveStatus}`}>{SAVE_LABEL[saveStatus]}</span>
      </div>
      <div className="lc-chat-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="lc-chat-empty">
            Mô tả workflow cho AI. Chọn các ô trên canvas (click hoặc kéo khung) để đính kèm chúng vào
            lượt chat. Gõ <b>/</b> để xem lệnh.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`lc-msg lc-msg-${m.role}`}>
            {m.refs && m.refs.length > 0 && (
              <button className="lc-msg-refs" title="Chọn nhóm này trên canvas" onClick={() => onFocusRefs(m.refs!)}>
                📎 {m.refs.map((r) => r.title || r.id).join(', ')}
              </button>
            )}
            {m.text}
          </div>
        ))}
        {busy && <div className="lc-msg lc-msg-ai lc-thinking">AI đang nghĩ…</div>}
      </div>
      <div className="lc-chat-input">
        {attached.length > 0 && (
          <div className="lc-attach">
            <div className="lc-attach-head">
              <button className="lc-attach-name" title="Chọn nhóm này trên canvas" onClick={() => onFocusRefs(attached)}>
                📎 Đính kèm {attached.length} ô
              </button>
              <button className="lc-x" title="Gỡ cả nhóm" onClick={() => onDetach()}>
                ×
              </button>
            </div>
            <div className="lc-chips">
              {attached.map((s) => (
                <span key={s.id} className="lc-chip">
                  {s.title || s.id}
                  <button className="lc-x" title="Gỡ ô này" onClick={() => onDetach(s.id)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
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
