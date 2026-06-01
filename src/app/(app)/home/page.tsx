'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserStore } from '@/stores/userStore'
import { useInventarioStore } from '@/stores/inventarioStore'
import { StatCard } from '@/components/ui/StatCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SettingsModal } from '@/components/ui/SettingsModal'
import { StickerBadge } from '@/components/stickers/StickerBadge'
import { HelpModal } from '@/components/tutorial/HelpModal'

const TOTAL = 980

export default function HomePage() {
  const { profile, fetchProfile } = useUserStore()
  const { entries, missing, stats, fetchInventario } = useInventarioStore()
  const router = useRouter()
  const [pdfLoading, setPdfLoading] = useState(false)
  const [helpVisible, setHelpVisible] = useState(false)

  useEffect(() => {
    fetchProfile()
    fetchInventario()
  }, [fetchProfile, fetchInventario])

  const handleExportPDF = async () => {
    setPdfLoading(true)
    try {
      const faltantes = missing.map((c) => ({ sticker_code: c.sticker_code, country_name: c.country_name }))
      const repetidas = entries
        .filter((e) => e.quantity_owned > 1)
        .map((e) => ({ sticker_code: e.sticker_code, quantity_owned: e.quantity_owned }))
      const { exportPDF } = await import('@/services/pdfExport')
      await exportPDF({ displayName: profile?.display_name ?? 'Colecionador', faltantes, repetidas })
    } finally {
      setPdfLoading(false)
    }
  }

  const recent = [...entries]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5)

  const progress = stats.coladas / TOTAL

  return (
    <div className="min-h-screen bg-ink-900 px-4 pt-safe pb-24">
      {/* Header */}
      <div className="flex items-center justify-between py-5">
        <div>
          <p className="text-ink-500 text-sm font-body">Olá,</p>
          <h1 className="font-heading text-2xl text-ink-100 font-bold leading-tight">
            {profile?.display_name ?? '…'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHelpVisible(true)}
            className="w-10 h-10 rounded-full bg-white/6 flex items-center justify-center text-ink-400 hover:bg-white/10 transition-colors"
            aria-label="Ajuda"
          >
            <span className="font-heading font-bold text-base leading-none">?</span>
          </button>
          <SettingsModal onExportPDF={() => void handleExportPDF()} />
        </div>
        <HelpModal visible={helpVisible} onClose={() => setHelpVisible(false)} screen="home" />
      </div>

      {/* Progress card */}
      <div className="bg-ink-800 rounded-xl p-4 mb-4">
        <div className="flex justify-between items-baseline mb-3">
          <span className="font-display text-5xl text-gold-400 leading-none">
            {(progress * 100).toFixed(0)}%
          </span>
          <span className="text-ink-400 text-sm font-body">
            {stats.coladas}/{TOTAL} coladas
          </span>
        </div>
        <ProgressBar value={progress} />
      </div>

      {/* 4 StatCards em 2×2 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard
          label="Coladas"
          value={stats.coladas}
          color="#22C55E"
          bg="rgba(34,197,94,0.10)"
          icon="✅"
          onClick={() => router.push('/inventario?tab=coladas')}
        />
        <StatCard
          label="Faltantes"
          value={stats.faltantes}
          color="#F43F5E"
          bg="rgba(244,63,94,0.10)"
          icon="❌"
          onClick={() => router.push('/inventario?tab=faltantes')}
        />
        <StatCard
          label="Estoque"
          value={stats.estoque}
          color="#3B82F6"
          bg="rgba(59,130,246,0.10)"
          icon="📦"
          onClick={() => router.push('/inventario?tab=estoque')}
        />
        <StatCard
          label="Repetidas"
          value={stats.repetidas}
          color="#F59E0B"
          bg="rgba(245,158,11,0.10)"
          icon="🔁"
          onClick={() => router.push('/inventario?tab=repetidas')}
        />
      </div>

      {/* Últimas figurinhas */}
      {recent.length > 0 && (
        <div className="bg-ink-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-700/50">
            <h2 className="font-heading font-semibold text-ink-300 text-sm uppercase tracking-wider">
              Adicionadas recentemente
            </h2>
          </div>
          <div className="divide-y divide-ink-700/30">
            {recent.map((e) => (
              <div key={e.sticker_code} className="flex items-center gap-3 px-4 py-3">
                <StickerBadge
                  code={e.sticker_code}
                  groupLabel={e.group_label}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-ink-200 text-sm font-body truncate">{e.country_name}</p>
                  <p className="text-ink-500 text-xs font-body">
                    {e.is_pasted ? 'Colada' : `×${e.quantity_owned} em estoque`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dica quando vazio */}
      {entries.length === 0 && (
        <div className="bg-cobalt-500/10 border border-cobalt-500/20 rounded-xl px-4 py-3 mt-4">
          <p className="text-cobalt-400 text-sm font-body">
            Use o <strong>Scan</strong> para registrar suas figurinhas rapidamente com a câmera.
          </p>
        </div>
      )}

      {/* PDF loading overlay */}
      {pdfLoading && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center gap-4 z-50"
          style={{ backgroundColor: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(4px)' }}
        >
          <div className="w-12 h-12 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-ink-300 font-body text-sm">Gerando PDF…</p>
        </div>
      )}
    </div>
  )
}
