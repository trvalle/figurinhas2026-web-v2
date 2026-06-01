'use client'
import { useRef, useState } from 'react'
import type { MatchResult } from '@/types/app.types'

interface MatchCardProps {
  match: MatchResult
  currentUserId: string
  partnerName: string
  partnerAddress: string
  onPropose: (receiverId: string, offered: string[], requested: string[]) => Promise<void>
}

function CodeChip({
  code, active, activeColor, onClick,
}: {
  code: string; active: boolean; activeColor: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded-lg text-xs font-mono transition-all active:scale-95"
      style={{
        backgroundColor: active ? activeColor : 'rgba(255,255,255,0.06)',
        color: active ? '#fff' : '#94A3B8',
        border: active ? 'none' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {code}
    </button>
  )
}

export function MatchCard({ match, currentUserId, partnerName, partnerAddress, onPropose }: MatchCardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [offered,   setOffered]   = useState<Set<string>>(new Set())
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [proposing, setProposing] = useState(false)
  const [sent,      setSent]      = useState(false)

  const iAmA      = match.user_a_id === currentUserId
  const partnerId = iAmA ? match.user_b_id   : match.user_a_id
  const canGive   = iAmA ? match.stickers_a_can_give : match.stickers_b_can_give
  const canReceive = iAmA ? match.stickers_b_can_give : match.stickers_a_can_give

  const toggle = (
    code: string,
    _set: Set<string>,
    setter: (fn: (p: Set<string>) => Set<string>) => void,
  ) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const selectAll = () => {
    setOffered(new Set(canGive))
    setRequested(new Set(canReceive))
  }

  const handlePropose = async () => {
    if (offered.size === 0 || requested.size === 0) return
    setProposing(true)
    try {
      await onPropose(partnerId, [...offered], [...requested])
      setSent(true)
      dialogRef.current?.close()
      setOffered(new Set())
      setRequested(new Set())
    } finally {
      setProposing(false)
    }
  }

  const distLabel =
    match.distance_km < 1
      ? `${Math.round(match.distance_km * 1000)}m`
      : `${match.distance_km.toFixed(1)}km`

  return (
    <>
      {/* Card de listagem */}
      <div
        className="bg-ink-800 rounded-xl p-4 cursor-pointer hover:bg-ink-700/80 transition-colors active:scale-[0.98]"
        onClick={() => { if (!sent) dialogRef.current?.showModal() }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-ink-100 font-heading font-semibold text-sm truncate">{partnerName}</p>
              {/* Badge bilateral — sempre verdadeiro com a nova regra */}
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-body flex-shrink-0"
                style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}
              >
                🎯 bilateral
              </span>
            </div>
            <p className="text-ink-500 text-xs font-body truncate">{partnerAddress}</p>
          </div>
          <span className="text-gold-400 text-xs font-mono font-bold flex-shrink-0">{distLabel}</span>
        </div>

        <div className="flex items-center gap-3 text-xs font-body mt-3">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{ background: 'rgba(59,130,246,0.12)' }}
          >
            <span style={{ color: '#93C5FD' }}>↑ ofereço</span>
            <span className="font-mono font-bold" style={{ color: '#60A5FA' }}>{canGive.length}</span>
          </div>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{ background: 'rgba(34,197,94,0.12)' }}
          >
            <span style={{ color: '#86EFAC' }}>↓ quero</span>
            <span className="font-mono font-bold" style={{ color: '#4ADE80' }}>{canReceive.length}</span>
          </div>
          {sent
            ? <span className="ml-auto text-verde-400 text-xs font-body">Proposta enviada ✓</span>
            : <span className="ml-auto text-ink-600 text-xs font-body">toque para propor</span>
          }
        </div>
      </div>

      {/* Bottom sheet de proposta */}
      <dialog
        ref={dialogRef}
        className="m-0 w-full max-w-full bg-transparent p-0 outline-none backdrop:bg-ink-900/80 backdrop:backdrop-blur-sm"
        style={{ marginTop: 'auto', marginBottom: 0, maxHeight: '90vh' }}
        onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current?.close() }}
      >
        <style>{`
          dialog[open] > .slide-up {
            animation: matchSlideUp 220ms cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
          }
          @keyframes matchSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        <div className="slide-up bg-ink-800 rounded-t-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
          <div className="pt-3 pb-1">
            <div className="w-10 h-1 bg-ink-600 rounded-full mx-auto" />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between px-5 py-3 border-b border-ink-700">
            <div>
              <h2 className="font-heading font-bold text-ink-100 text-base">{partnerName}</h2>
              <p className="text-ink-500 text-xs font-body">
                {partnerAddress} · {distLabel} ·{' '}
                <span style={{ color: '#4ADE80' }}>🎯 troca bilateral confirmada</span>
              </p>
            </div>
            <button
              onClick={() => dialogRef.current?.close()}
              className="text-ink-400 hover:text-ink-200 text-2xl leading-none mt-0.5"
            >
              ×
            </button>
          </div>

          {/* Botão selecionar todos */}
          <div className="px-5 pt-3 pb-1 flex items-center justify-between">
            <p className="text-ink-500 text-xs font-body">
              Selecione o que quer trocar
            </p>
            <button
              onClick={selectAll}
              className="text-gold-400 text-xs font-body hover:text-gold-300 transition-colors underline underline-offset-2"
            >
              Selecionar todos
            </button>
          </div>

          {/* Listas de chips */}
          <div className="flex-1 overflow-y-auto px-5 pb-2 flex flex-col gap-5">
            {/* O que o parceiro pode trocar */}
            <div>
              <p className="text-xs font-body uppercase tracking-wider mb-2 flex items-center gap-2"
                style={{ color: '#4ADE80' }}>
                <span>↓</span>
                <span>{partnerName} pode te trocar ({requested.size}/{canReceive.length})</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {canReceive.map((code) => (
                  <CodeChip
                    key={code}
                    code={code}
                    active={requested.has(code)}
                    activeColor="#22C55E"
                    onClick={() => toggle(code, requested, setRequested)}
                  />
                ))}
              </div>
            </div>

            {/* O que você pode trocar */}
            <div>
              <p className="text-xs font-body uppercase tracking-wider mb-2 flex items-center gap-2"
                style={{ color: '#60A5FA' }}>
                <span>↑</span>
                <span>Você pode trocar ({offered.size}/{canGive.length})</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {canGive.map((code) => (
                  <CodeChip
                    key={code}
                    code={code}
                    active={offered.has(code)}
                    activeColor="#3B82F6"
                    onClick={() => toggle(code, offered, setOffered)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-ink-700 pb-safe">
            {(offered.size === 0 || requested.size === 0) && (
              <p className="text-ink-600 text-xs font-body text-center mb-2">
                Selecione ao menos 1 figurinha de cada lado para propor
              </p>
            )}
            <button
              onClick={() => void handlePropose()}
              disabled={proposing || offered.size === 0 || requested.size === 0}
              className="w-full py-3 bg-gold-500 hover:bg-gold-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-display text-xl text-ink-900 transition-colors"
            >
              {proposing
                ? 'Enviando…'
                : offered.size > 0 && requested.size > 0
                  ? `Propor troca — troco ${offered.size} · quero ${requested.size}`
                  : 'Propor troca'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
