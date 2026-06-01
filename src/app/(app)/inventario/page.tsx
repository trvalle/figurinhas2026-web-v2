'use client'
import { Suspense, useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Share2 } from 'lucide-react'
import { useInventarioStore } from '@/stores/inventarioStore'
import { HelpModal } from '@/components/tutorial/HelpModal'
import { StickerCard } from '@/components/stickers/StickerCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { InventarioEntry } from '@/types/app.types'

type TabKey = 'coladas' | 'repetidas' | 'faltantes' | 'estoque'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'coladas',  label: 'Coladas',  icon: '✅' },
  { key: 'repetidas', label: 'Repetidas', icon: '🔁' },
  { key: 'faltantes', label: 'Faltantes', icon: '❌' },
  { key: 'estoque',  label: 'Estoque',  icon: '📦' },
]

function InventarioContent() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabKey | null) ?? 'coladas'
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [helpVisible, setHelpVisible] = useState(false)

  const {
    entries, missing, stats, loading,
    fetchInventario, markPasted, addToEstoque, removeOneUnit,
  } = useInventarioStore()

  useEffect(() => { fetchInventario() }, [fetchInventario])

  // items per tab — entries already have catalog data joined
  const items = useMemo((): InventarioEntry[] => {
    switch (tab) {
      case 'coladas':
        return entries.filter((e) => e.is_pasted)

      case 'repetidas':
        return entries.filter((e) => e.quantity_owned > 1)

      case 'estoque':
        return entries.filter((e) => !e.is_pasted && e.quantity_owned === 1)

      case 'faltantes':
        return missing.map((c) => ({
          id: '',
          user_id: '',
          quantity_owned: 0,
          is_pasted: false,
          updated_at: '',
          ...c,
        }))
    }
  }, [tab, entries, missing])

  // progressByCountry computed from entries + missing (all catalog data in store)
  const progressByCountry = useMemo(() => {
    if (tab !== 'faltantes') return {} as Record<string, { owned: number; total: number }>
    const totals: Record<string, number> = {}
    const ownedMap: Record<string, number> = {}

    entries.forEach((e) => {
      totals[e.country_code] = (totals[e.country_code] ?? 0) + 1
    })
    missing.forEach((c) => {
      totals[c.country_code] = (totals[c.country_code] ?? 0) + 1
    })
    entries.filter((e) => e.is_pasted).forEach((e) => {
      ownedMap[e.country_code] = (ownedMap[e.country_code] ?? 0) + 1
    })

    const result: Record<string, { owned: number; total: number }> = {}
    Object.keys(totals).forEach((cc) => {
      result[cc] = { owned: ownedMap[cc] ?? 0, total: totals[cc] ?? 0 }
    })
    return result
  }, [tab, entries, missing])

  const handleShare = useCallback(async () => {
    const lines = items.map((s) => `${s.sticker_code} — ${s.country_name}`)
    const text = `Figurinhas Copa 2026 — ${TABS.find((t) => t.key === tab)?.label}\n\n${lines.join('\n')}`
    if (navigator.share) {
      await navigator.share({ title: 'Figurinhas Copa 2026', text })
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Lista copiada!')
    }
  }, [items, tab])

  const handleSwipe = useCallback(
    (sticker: InventarioEntry, direction: 'right' | 'left') => {
      if (tab === 'faltantes' && direction === 'right') {
        void addToEstoque(sticker.sticker_code)
        toast.success(`${sticker.sticker_code} adicionada ao estoque`)
      } else if (tab !== 'faltantes') {
        if (direction === 'right') {
          void markPasted(sticker.sticker_code, true)
          toast.success(`${sticker.sticker_code} marcada como colada`)
        } else {
          if (sticker.is_pasted && sticker.quantity_owned <= 1) {
            toast.error('Figurinha colada não pode ser removida sem ter mais cópias')
            return
          }
          void removeOneUnit(sticker.sticker_code)
        }
      }
    },
    [tab, markPasted, addToEstoque, removeOneUnit],
  )

  // group faltantes by country
  const faltantesByCountry = useMemo(() => {
    if (tab !== 'faltantes') return {} as Record<string, InventarioEntry[]>
    const groups: Record<string, InventarioEntry[]> = {}
    items.forEach((s) => {
      if (!groups[s.country_code]) groups[s.country_code] = []
      groups[s.country_code]!.push(s)
    })
    return groups
  }, [tab, items])

  return (
    <div className="min-h-screen bg-ink-900 pt-safe pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur-md px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-3xl text-gold-400 tracking-wide">INVENTÁRIO</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHelpVisible(true)}
              className="w-9 h-9 rounded-full bg-white/6 flex items-center justify-center text-ink-400 hover:bg-white/10 transition-colors"
              aria-label="Ajuda"
            >
              <span className="font-heading font-bold text-base leading-none">?</span>
            </button>
            {items.length > 0 && (
              <button
                onClick={() => void handleShare()}
                className="flex items-center gap-1.5 text-ink-400 hover:text-ink-200 transition-colors text-sm font-body"
              >
                <Share2 size={16} />
                Compartilhar
              </button>
            )}
          </div>
          <HelpModal visible={helpVisible} onClose={() => setHelpVisible(false)} screen="inventario" />
        </div>

        {/* Chips de filtro */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none">
          {TABS.map((t) => {
            const count = t.key === 'coladas'  ? stats.coladas
                        : t.key === 'repetidas' ? stats.repetidas
                        : t.key === 'faltantes' ? stats.faltantes
                        : stats.estoque
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-gold-500 text-ink-900'
                    : 'bg-white/8 text-ink-400 hover:bg-white/12'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  tab === t.key ? 'bg-ink-900/30 text-ink-900' : 'bg-white/10 text-ink-500'
                }`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-gold-500/30 border-t-gold-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <span className="text-4xl mb-3">{TABS.find((t) => t.key === tab)?.icon}</span>
          <p className="text-ink-400 font-body">Nenhuma figurinha em {TABS.find((t) => t.key === tab)?.label.toLowerCase()}</p>
        </div>
      ) : tab === 'faltantes' ? (
        <div className="px-4 pt-2">
          {Object.entries(faltantesByCountry).map(([cc, sfaltantes]) => {
            const prog = progressByCountry[cc]
            const isAlmostDone = sfaltantes.length <= 2
            return (
              <div key={cc} className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-ink-200 text-sm">
                      {sfaltantes[0]?.country_name}
                    </span>
                    {isAlmostDone && (
                      <span className="text-xs bg-gold-500/20 text-gold-400 px-2 py-0.5 rounded-full font-body">
                        ⚡ Quase lá!
                      </span>
                    )}
                  </div>
                  <span className="text-ink-500 text-xs font-mono">
                    {prog?.owned ?? 0}/{prog?.total ?? 0}
                  </span>
                </div>
                {prog && (
                  <div className="mb-2">
                    <ProgressBar value={prog.total > 0 ? prog.owned / prog.total : 0} />
                  </div>
                )}
                <div className="bg-ink-800 rounded-xl overflow-hidden">
                  {sfaltantes.map((s) => (
                    <div key={s.sticker_code} className="border-b border-ink-700/30 last:border-b-0">
                      <StickerCard
                        sticker={s}
                        listContext="faltante"
                        onSwipeRight={() => handleSwipe(s, 'right')}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-ink-800 mx-4 mt-2 rounded-xl overflow-hidden">
          {items.map((s) => (
            <div key={s.id || s.sticker_code} className="border-b border-ink-700/30 last:border-b-0">
              <StickerCard
                sticker={s}
                listContext="default"
                onSwipeRight={() => handleSwipe(s, 'right')}
                onSwipeLeft={() => handleSwipe(s, 'left')}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function InventarioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-ink-900 flex items-center justify-center pt-safe">
        <div className="w-8 h-8 rounded-full border-2 border-gold-500/30 border-t-gold-500 animate-spin" />
      </div>
    }>
      <InventarioContent />
    </Suspense>
  )
}
