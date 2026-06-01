'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCatalog } from '@/hooks/useCatalog'
import { PageSpreadGrid } from '@/components/onboarding/PageSpreadGrid'
import { LandscapeHintModal } from '@/components/onboarding/LandscapeHintModal'
import { getSupabaseClient } from '@/services/supabase'
import type { CatalogEntry } from '@/types/app.types'

type OnboardingStep = 'intro' | 'progress' | 'saving' | 'done'

const LS_PROGRESS_KEY = 'onboarding_progress'

interface SavedProgress {
  selected: string[]
  spreadIndex: number
}

function groupByCountry(catalog: CatalogEntry[]): CatalogEntry[][] {
  const byCountry = new Map<string, CatalogEntry[]>()
  for (const entry of catalog) {
    const arr = byCountry.get(entry.country_code) ?? []
    arr.push(entry)
    byCountry.set(entry.country_code, arr)
  }

  const groups: CatalogEntry[][] = []
  for (const [code, stickers] of byCountry) {
    if (code === 'FWC') {
      const early = stickers.filter((s) => s.number_in_team <= 8)
      const late = stickers.filter((s) => s.number_in_team >= 9)
      if (early.length > 0) groups.push(early)
      if (late.length > 0) groups.push(late)
    } else {
      groups.push(stickers)
    }
  }

  return groups
    .sort((a, b) => (a[0]?.album_page ?? 0) - (b[0]?.album_page ?? 0))
    .map((stickers) => [...stickers].sort((a, b) => a.number_in_team - b.number_in_team))
}

async function saveToSupabase(selected: Set<string>): Promise<void> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Fetch current state so we don't overwrite quantity_owned
  const { data: current } = await supabase
    .from('user_stickers')
    .select('sticker_code, is_pasted')
    .eq('user_id', user.id)

  const currentMap = new Map(current?.map((r) => [r.sticker_code as string, r.is_pasted as boolean]) ?? [])
  const selectedCodes = [...selected]

  // New stickers not yet in DB → INSERT with quantity_owned=1, is_pasted=true
  const toInsert = selectedCodes.filter((c) => !currentMap.has(c))
  // Existing stickers now selected but not yet pasted → UPDATE is_pasted=true
  const toMarkPasted = selectedCodes.filter((c) => currentMap.has(c) && !currentMap.get(c))
  // Previously pasted stickers now deselected → DELETE (returns them to faltantes)
  const toRemove = [...currentMap.entries()]
    .filter(([code, pasted]) => pasted && !selected.has(code))
    .map(([code]) => code)

  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100)
    await supabase.from('user_stickers').insert(
      batch.map((code) => ({
        user_id: user.id,
        sticker_code: code,
        quantity_owned: 1,
        is_pasted: true,
      })),
    )
  }

  for (let i = 0; i < toMarkPasted.length; i += 100) {
    const batch = toMarkPasted.slice(i, i + 100)
    await supabase
      .from('user_stickers')
      .update({ is_pasted: true })
      .eq('user_id', user.id)
      .in('sticker_code', batch)
  }

  for (let i = 0; i < toRemove.length; i += 100) {
    const batch = toRemove.slice(i, i + 100)
    await supabase
      .from('user_stickers')
      .delete()
      .eq('user_id', user.id)
      .in('sticker_code', batch)
  }
}

export default function OnboardingPage() {
  const router = useRouter()
  const { catalog, loading } = useCatalog()

  const [step, setStep] = useState<OnboardingStep>('intro')
  const [spreads, setSpreads] = useState<CatalogEntry[][]>([])
  const [spreadIndex, setSpreadIndex] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [savedCount, setSavedCount] = useState(0)
  const [loadingStickers, setLoadingStickers] = useState(true)

  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  useEffect(() => {
    if (catalog.length === 0) return
    const grouped = groupByCountry(catalog)
    setSpreads(grouped)

    const loadInitial = async () => {
      setLoadingStickers(true)
      try {
        // Always fetch from DB — source of truth (localStorage can be stale
        // when stickers are added via scanner between onboarding sessions)
        const supabase = getSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
          .from('user_stickers')
          .select('sticker_code')
          .eq('user_id', user.id)
          .eq('is_pasted', true)

        const codes = new Set((data ?? []).map((r) => r.sticker_code as string))
        setSelected(codes)
        setSavedCount(codes.size)

        // Restore only the page position from localStorage (not sticker selections)
        const raw = localStorage.getItem(LS_PROGRESS_KEY)
        if (raw) {
          const saved: SavedProgress = JSON.parse(raw)
          setSpreadIndex(Math.min(saved.spreadIndex, grouped.length - 1))
        }
      } catch { /* ignore */ } finally {
        setLoadingStickers(false)
      }
    }

    void loadInitial()
  }, [catalog])

  const hasProgress = selected.size > 0

  const persistLocal = useCallback((sel: Set<string>, idx: number) => {
    const progress: SavedProgress = { selected: [...sel], spreadIndex: idx }
    localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify(progress))
  }, [])

  const handleToggle = useCallback((code: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }, [])

  const handleSelectAll = useCallback((codes: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      codes.forEach((c) => next.add(c))
      return next
    })
  }, [])

  const handleSelectNone = useCallback((codes: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      codes.forEach((c) => next.delete(c))
      return next
    })
  }, [])

  const handlePrev = useCallback(() => {
    setSpreadIndex((i) => Math.max(0, i - 1))
  }, [])

  const handleNext = useCallback(async () => {
    if (spreadIndex >= spreads.length - 1) {
      setStep('saving')
      try {
        await saveToSupabase(selected)
        localStorage.removeItem(LS_PROGRESS_KEY)
        setStep('done')
      } catch {
        setStep('progress')
      }
    } else {
      setSpreadIndex((i) => i + 1)
    }
  }, [spreadIndex, spreads.length, selected])

  const handleExit = useCallback(async () => {
    persistLocal(selected, spreadIndex)
    try {
      await saveToSupabase(selected)
    } catch { /* local already saved */ }
    router.push('/home')
  }, [selected, spreadIndex, persistLocal, router])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? 0
    touchStartY.current = e.touches[0]?.clientY ?? 0
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
    const dy = Math.abs((e.changedTouches[0]?.clientY ?? 0) - touchStartY.current)
    if (Math.abs(dx) < 60 || dy > Math.abs(dx)) return
    if (dx < 0) void handleNext()
    else handlePrev()
  }, [handleNext, handlePrev])

  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-center">
          <div className="text-6xl mb-4">⚽</div>
          <h1 className="font-display text-3xl text-ink-100 mb-2">
            Configure seu álbum
          </h1>
          <p className="text-ink-400 font-body text-sm leading-relaxed max-w-xs">
            Marque as figurinhas que você já tem coladas. Pode sair a qualquer
            momento e continuar depois.
          </p>
        </div>

        {hasProgress && (
          <div className="bg-gold-500/10 border border-gold-500/30 rounded-xl px-4 py-3 text-center w-full max-w-xs">
            <p className="text-gold-400 text-sm font-body">
              Progresso salvo: {savedCount} figurinha{savedCount !== 1 ? 's' : ''} marcada{savedCount !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {(loading || loadingStickers) ? (
          <div className="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <button
            onClick={() => setStep('progress')}
            className="w-full max-w-xs py-4 bg-gold-500 hover:bg-gold-600 rounded-xl font-display text-xl text-ink-900 transition-colors"
          >
            {hasProgress ? 'Continuar configuração' : 'Começar'}
          </button>
        )}

        <button
          onClick={() => router.push('/home')}
          className="w-full max-w-xs py-3 border border-ink-700 hover:border-ink-500 rounded-xl font-body text-sm text-ink-400 hover:text-ink-200 transition-colors"
        >
          Avançar para Home
        </button>
      </div>
    )
  }

  if (step === 'saving') {
    return (
      <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-ink-400 font-body text-sm">Salvando seu álbum…</p>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center px-6 gap-6 text-center">
        <div className="text-6xl">🎉</div>
        <div>
          <h1 className="font-display text-3xl text-ink-100 mb-2">
            Álbum configurado!
          </h1>
          <p className="text-ink-400 font-body text-sm">
            {selected.size} figurinha{selected.size !== 1 ? 's' : ''} marcada{selected.size !== 1 ? 's' : ''} como colada{selected.size !== 1 ? 's' : ''}.
          </p>
        </div>
        <button
          onClick={() => router.push('/home')}
          className="w-full max-w-xs py-4 bg-gold-500 hover:bg-gold-600 rounded-xl font-display text-xl text-ink-900 transition-colors"
        >
          Avançar para Home
        </button>
      </div>
    )
  }

  const currentSpread = spreads[spreadIndex]
  if (loading || spreads.length === 0 || !currentSpread) {
    return (
      <div className="min-h-screen bg-ink-900 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isLast = spreadIndex >= spreads.length - 1
  const progressPct = spreads.length > 0 ? ((spreadIndex + 1) / spreads.length) * 100 : 0

  return (
    <div className="min-h-screen bg-ink-900 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <LandscapeHintModal />
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800 flex-shrink-0">
        <button
          onClick={() => void handleExit()}
          className="text-ink-400 hover:text-ink-200 text-sm font-body transition-colors"
        >
          Sair
        </button>
        <span className="text-ink-400 text-xs font-body">
          {spreadIndex + 1} / {spreads.length}
        </span>
        <div className="w-8" />
      </div>

      <div className="h-1 bg-ink-800 flex-shrink-0">
        <div
          className="h-full bg-gold-500 transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="px-4 py-2 flex-shrink-0">
        <span className="text-ink-500 text-xs font-body">
          {selected.size} figurinha{selected.size !== 1 ? 's' : ''} marcada{selected.size !== 1 ? 's' : ''}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 pb-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <PageSpreadGrid
          stickers={currentSpread}
          selected={selected}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
          onSelectNone={handleSelectNone}
          spreadIndex={spreadIndex}
        />
      </div>

      <div
        className="flex gap-3 px-4 py-4 border-t border-ink-800 flex-shrink-0"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handlePrev}
          disabled={spreadIndex === 0}
          className="flex-1 py-3 rounded-xl border border-ink-700 font-body text-sm text-ink-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:border-ink-500 hover:text-ink-100"
        >
          ← Anterior
        </button>
        <button
          onClick={() => void handleNext()}
          className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-600 font-display text-lg text-ink-900 transition-colors"
        >
          {isLast ? 'Concluir ✓' : 'Próxima →'}
        </button>
      </div>
    </div>
  )
}
