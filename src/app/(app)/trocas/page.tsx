'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTrocaStore } from '@/stores/trocaStore'
import { useUserStore } from '@/stores/userStore'
import { MatchCard } from '@/components/trocas/MatchCard'
import { getSupabaseClient } from '@/services/supabase'
import { HelpModal } from '@/components/tutorial/HelpModal'
import { hasLocation, requestAndSaveLocation } from '@/services/geolocation'
import type { TradeProposal } from '@/types/app.types'

type Tab = 'proximos' | 'propostas' | 'recebidas'

interface PartnerInfo {
  display_name: string
  address_display: string
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Aguardando', color: '#F59E0B' },
  accepted:  { label: 'Aceita',     color: '#22C55E' },
  rejected:  { label: 'Recusada',   color: '#F43F5E' },
  cancelled: { label: 'Cancelada',  color: '#64748B' },
  completed: { label: 'Concluída',  color: '#3B82F6' },
}

function ProposalRow({
  proposal,
  partnerId,
  partnerName,
  isMine,
  onAccept,
  onReject,
  onCancel,
}: {
  proposal: TradeProposal
  partnerId: string
  partnerName: string
  isMine: boolean
  onAccept: (p: TradeProposal) => void
  onReject: (id: string) => void
  onCancel: (id: string) => void
}) {
  const meta = STATUS_META[proposal.status] ?? { label: proposal.status, color: '#64748B' }

  return (
    <div className="bg-ink-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-ink-200 font-heading font-semibold text-sm truncate">{partnerName}</p>
          <p className="text-ink-500 text-xs font-body mt-0.5">
            {new Date(proposal.created_at).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <span
          className="text-xs font-body px-2 py-1 rounded-full flex-shrink-0"
          style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
        >
          {meta.label}
        </span>
      </div>

      <div className="flex gap-3 text-xs font-body text-ink-500">
        <span>↑ {proposal.stickers_offered.length} ofereço</span>
        <span>↓ {proposal.stickers_requested.length} quero</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {proposal.stickers_offered.slice(0, 6).map((c) => (
          <span key={c} className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}>{c}</span>
        ))}
        {proposal.stickers_offered.length > 6 && (
          <span className="text-ink-600 text-[10px] font-body">+{proposal.stickers_offered.length - 6}</span>
        )}
        <span className="text-ink-700 mx-1">·</span>
        {proposal.stickers_requested.slice(0, 6).map((c) => (
          <span key={c} className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#86EFAC' }}>{c}</span>
        ))}
        {proposal.stickers_requested.length > 6 && (
          <span className="text-ink-600 text-[10px] font-body">+{proposal.stickers_requested.length - 6}</span>
        )}
      </div>

      {isMine && proposal.status === 'pending' && (
        <button
          onClick={() => onCancel(proposal.id)}
          className="self-start text-xs font-body text-ink-500 hover:text-scarlet-400 underline underline-offset-2 transition-colors"
        >
          Cancelar proposta
        </button>
      )}
      {!isMine && proposal.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={() => onAccept(proposal)}
            className="flex-1 py-2 rounded-xl bg-verde-500 hover:bg-verde-600 text-white font-body text-sm font-semibold transition-colors"
          >
            Aceitar
          </button>
          <button
            onClick={() => onReject(proposal.id)}
            className="flex-1 py-2 rounded-xl border border-scarlet-500/50 text-scarlet-400 hover:bg-scarlet-500/10 font-body text-sm font-semibold transition-colors"
          >
            Recusar
          </button>
        </div>
      )}
    </div>
  )
}

export default function TrocasPage() {
  const [tab, setTab] = useState<Tab>('proximos')
  const [partners, setPartners] = useState<Map<string, PartnerInfo>>(new Map())
  const [helpVisible, setHelpVisible] = useState(false)
  const [locationChecked, setLocationChecked] = useState(false)
  const [whatsappReveal, setWhatsappReveal] = useState<{ name: string; number: string } | null>(null)

  const { profile, fetchProfile } = useUserStore()
  const { matches, proposals, loading, fetchMatches, fetchProposals, sendProposal, respondProposal } = useTrocaStore()

  useEffect(() => {
    fetchProfile()
    fetchMatches()
    fetchProposals()
  }, [fetchProfile, fetchMatches, fetchProposals])

  const currentUserId = profile?.id ?? ''

  useEffect(() => {
    if (!matches.length && !proposals.length) return

    const ids = new Set<string>()
    matches.forEach((m) => {
      ids.add(m.user_a_id === currentUserId ? m.user_b_id : m.user_a_id)
    })
    proposals.forEach((p) => {
      ids.add(p.proposer_id === currentUserId ? p.receiver_id : p.proposer_id)
    })

    const uniqueIds = [...ids].filter(Boolean)
    if (!uniqueIds.length) return

    const supabase = getSupabaseClient()
    supabase
      .from('public_profiles')
      .select('id, display_name, address_display')
      .in('id', uniqueIds)
      .then(({ data }) => {
        if (!data) return
        const map = new Map<string, PartnerInfo>()
        data.forEach((row) => {
          if (row.id) {
            map.set(row.id, {
              display_name: row.display_name ?? 'Colecionador',
              address_display: row.address_display ?? '',
            })
          }
        })
        setPartners(map)
      })
  }, [matches, proposals, currentUserId])

  useEffect(() => {
    if (locationChecked || !currentUserId) return
    setLocationChecked(true)

    hasLocation().then((has) => {
      if (!has) {
        const ok = window.confirm(
          'Para encontrar colecionadores próximos, podemos usar sua localização? (não será exibida exatamente)',
        )
        if (ok) {
          requestAndSaveLocation().then((saved) => {
            if (saved) fetchMatches()
          })
        }
      }
    })
  }, [currentUserId, locationChecked, fetchMatches])

  const handlePropose = useCallback(
    async (receiverId: string, offered: string[], requested: string[]) => {
      await sendProposal({ receiver_id: receiverId, stickers_offered: offered, stickers_requested: requested })
    },
    [sendProposal],
  )

  const handleAccept = useCallback(
    async (proposal: TradeProposal) => {
      await respondProposal(proposal.id, 'accepted')
      const supabase = getSupabaseClient()
      const { data } = await supabase
        .from('users')
        .select('display_name, whatsapp')
        .eq('id', proposal.proposer_id)
        .single()
      if (data?.whatsapp) {
        setWhatsappReveal({ name: data.display_name ?? 'Colecionador', number: data.whatsapp })
      }
    },
    [respondProposal],
  )

  const myProposals = proposals.filter((p) => p.proposer_id === currentUserId)
  const received = proposals.filter((p) => p.receiver_id === currentUserId)

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'proximos',  label: 'Matches',   count: matches.length },
    { key: 'propostas', label: 'Propostas', count: myProposals.length },
    { key: 'recebidas', label: 'Recebidas', count: received.filter((p) => p.status === 'pending').length },
  ]

  return (
    <div className="min-h-screen bg-ink-900 flex flex-col">
      <div className="px-4 pt-safe py-4 border-b border-ink-800 flex items-center justify-between">
        <h1 className="font-display text-3xl text-ink-100">Trocas</h1>
        <button
          onClick={() => setHelpVisible(true)}
          className="w-10 h-10 rounded-full bg-white/6 flex items-center justify-center text-ink-400 hover:bg-white/10 transition-colors"
          aria-label="Ajuda"
        >
          <span className="font-heading font-bold text-base leading-none">?</span>
        </button>
      </div>
      <HelpModal visible={helpVisible} onClose={() => setHelpVisible(false)} screen="trocas" />

      <div className="flex border-b border-ink-800 flex-shrink-0">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-xs font-body uppercase tracking-wider transition-colors relative ${
              tab === key ? 'text-gold-400' : 'text-ink-500 hover:text-ink-300'
            }`}
          >
            {label}
            {!!count && count > 0 && (
              <span
                className="ml-1 text-[10px] font-mono px-1.5 rounded-full"
                style={{
                  backgroundColor: tab === key ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.08)',
                  color: tab === key ? '#F59E0B' : '#64748B',
                }}
              >
                {count}
              </span>
            )}
            {tab === key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {loading && matches.length === 0 && proposals.length === 0 && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {tab === 'proximos' && (
          <>
            {!loading && matches.length === 0 && (
              <div className="text-center py-10 px-4">
                <p className="text-3xl mb-3">🔁</p>
                <p className="text-ink-300 font-heading font-semibold text-sm mb-1">
                  Nenhum match bilateral encontrado
                </p>
                <p className="text-ink-500 text-xs font-body leading-relaxed max-w-xs mx-auto">
                  Um match só aparece quando você tem repetidas que o outro precisa{' '}
                  <strong className="text-ink-400">e</strong> o outro tem repetidas que você precisa.
                  Escaneie mais figurinhas para aumentar as chances!
                </p>
              </div>
            )}
            {matches.map((m) => {
              const partnerId = m.user_a_id === currentUserId ? m.user_b_id : m.user_a_id
              const info = partners.get(partnerId)
              return (
                <MatchCard
                  key={`${m.user_a_id}-${m.user_b_id}`}
                  match={m}
                  currentUserId={currentUserId}
                  partnerName={info?.display_name ?? '…'}
                  partnerAddress={info?.address_display ?? ''}
                  onPropose={handlePropose}
                />
              )
            })}
          </>
        )}

        {tab === 'propostas' && (
          <>
            {myProposals.length === 0 && (
              <p className="text-center text-ink-500 font-body text-sm py-10">
                Você ainda não enviou nenhuma proposta.
              </p>
            )}
            {myProposals.map((p) => (
              <ProposalRow
                key={p.id}
                proposal={p}
                partnerId={p.receiver_id}
                partnerName={partners.get(p.receiver_id)?.display_name ?? '…'}
                isMine
                onAccept={handleAccept}
                onReject={(id) => void respondProposal(id, 'rejected')}
                onCancel={(id) => void respondProposal(id, 'cancelled')}
              />
            ))}
          </>
        )}

        {tab === 'recebidas' && (
          <>
            {received.length === 0 && (
              <p className="text-center text-ink-500 font-body text-sm py-10">
                Nenhuma proposta recebida ainda.
              </p>
            )}
            {received.map((p) => (
              <ProposalRow
                key={p.id}
                proposal={p}
                partnerId={p.proposer_id}
                partnerName={partners.get(p.proposer_id)?.display_name ?? '…'}
                isMine={false}
                onAccept={handleAccept}
                onReject={(id) => void respondProposal(id, 'rejected')}
                onCancel={(id) => void respondProposal(id, 'cancelled')}
              />
            ))}
          </>
        )}
      </div>

      {whatsappReveal && (
        <div
          className="fixed inset-0 flex items-end justify-center z-50"
          style={{ backgroundColor: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(4px)' }}
          onClick={() => setWhatsappReveal(null)}
        >
          <div
            className="w-full max-w-sm bg-ink-800 rounded-t-2xl px-6 py-8 text-center pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-3xl mb-3">🎉</div>
            <h2 className="font-display text-2xl text-ink-100 mb-1">Troca aceita!</h2>
            <p className="text-ink-400 font-body text-sm mb-4">
              Entre em contato com <strong className="text-ink-200">{whatsappReveal.name}</strong>:
            </p>
            <a
              href={`https://wa.me/${whatsappReveal.number.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 bg-verde-500 hover:bg-verde-600 rounded-xl font-display text-xl text-white transition-colors mb-3"
            >
              Abrir WhatsApp
            </a>
            <button
              onClick={() => setWhatsappReveal(null)}
              className="text-ink-500 text-sm font-body underline underline-offset-2"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
