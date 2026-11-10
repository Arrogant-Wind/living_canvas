import { useEffect, useRef, useState } from 'react'
import { api, type AiInfo } from '../api'

/** `fai/Alibaba:DeepSeek-V4.1-Flash` → provider `fai`, tên ngắn `DeepSeek-V4.1-Flash`. */
export function splitModel(model: string): { provider: string; name: string; short: string } {
  const slash = model.indexOf('/')
  const provider = slash > 0 ? model.slice(0, slash) : ''
  const name = slash > 0 ? model.slice(slash + 1) : model
  return { provider, name, short: name.split(':').pop() || name }
}

/** Nút ở đầu khung chat cho biết agent và model nào đang trả lời; bấm để xem chi tiết. */
export function AiBadge({ busy }: { busy: boolean }) {
  const [info, setInfo] = useState<AiInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.aiInfo().then(setInfo, () => setFailed(true))
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const m = info && splitModel(info.model)
  const label = info ? `${info.agent} · ${m!.short}` : failed ? 'Không rõ agent' : '…'

  return (
    <div className="lc-ai" ref={ref}>
      <button
        className="lc-ai-btn"
        title={info ? `Agent ${info.agent}, model ${info.model}` : 'Agent và model đang dùng'}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`lc-ai-dot${busy ? ' lc-ai-busy' : ''}${failed ? ' lc-ai-off' : ''}`} />
        🤖 {label}
      </button>
      {open && (
        <div className="lc-ai-pop">
          {info ? (
            <dl>
              <dt>Agent</dt>
              <dd>
                {info.agent} <code>{info.bin}</code>
              </dd>
              {m!.provider && (
                <>
                  <dt>Provider</dt>
                  <dd>{m!.provider}</dd>
                </>
              )}
              <dt>Model</dt>
              <dd>
                <code>{m!.name}</code>
              </dd>
              <dt>Tự sửa</dt>
              <dd>tối đa {info.maxRepairs} lần khi thao tác sai</dd>
              <dt>Thời gian chờ</dt>
              <dd>{Math.round(info.timeoutMs / 1000)} giây mỗi lần gọi</dd>
              <dt>Trạng thái</dt>
              <dd>{busy ? 'đang trả lời…' : 'sẵn sàng'}</dd>
            </dl>
          ) : (
            <p>{failed ? 'Không lấy được thông tin từ server.' : 'Đang tải…'}</p>
          )}
          <p className="lc-ai-hint">
            Đổi model bằng biến <code>LC_MODEL</code> rồi chạy lại server.
          </p>
        </div>
      )}
    </div>
  )
}
