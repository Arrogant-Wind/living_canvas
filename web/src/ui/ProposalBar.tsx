import { useState } from 'react'
import type { MountedProposal } from '../canvas/proposalEditor'

export function ProposalBar(props: {
  proposal: MountedProposal
  onAccept: (keys?: string[]) => void
  onReject: () => void
}) {
  const { proposal, onAccept, onReject } = props
  const [picking, setPicking] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(proposal.items.map((i) => [i.key, true])),
  )

  return (
    <div className="lc-proposal" onPointerDown={(e) => e.stopPropagation()}>
      <div className="lc-proposal-title">AI đề xuất {proposal.items.length} thay đổi</div>
      {picking && (
        <ul className="lc-proposal-list">
          {proposal.items.map((it) => (
            <li key={it.key}>
              <label>
                <input
                  type="checkbox"
                  checked={checked[it.key]}
                  onChange={(e) => setChecked({ ...checked, [it.key]: e.target.checked })}
                />
                {it.label}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="lc-proposal-actions">
        {picking ? (
          <button className="lc-ok" onClick={() => onAccept(proposal.items.filter((i) => checked[i.key]).map((i) => i.key))}>
            Nhận các mục đã chọn
          </button>
        ) : (
          <>
            <button className="lc-ok" onClick={() => onAccept()}>
              Nhận tất cả
            </button>
            <button onClick={() => setPicking(true)}>Chọn từng cái</button>
          </>
        )}
        <button className="lc-no" onClick={onReject}>
          Bỏ
        </button>
      </div>
    </div>
  )
}
