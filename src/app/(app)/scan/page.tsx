'use client'
import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import toast from 'react-hot-toast'
import { Zap, Pencil, Plus, ChevronDown, ChevronLeft, PackagePlus, X } from 'lucide-react'
import { useInventarioStore } from '@/stores/inventarioStore'
import { ScanResultScreen } from '@/components/scanner/ScanResultScreen'
import { HelpModal } from '@/components/tutorial/HelpModal'
import { loadCatalogCache } from '@/services/ocr'

const GoogleVisionScanner = dynamic(
  () => import('@/components/scanner/GoogleVisionScanner'),
  { ssr: false },
)

type ActivePanel = 'realtime' | 'manual' | null

interface ManualStickerWithStatus {
  code: string
  status: 'new' | 'duplicate' | 'pasted'
}

const PANELS: { key: NonNullable<ActivePanel>; icon: React.ElementType; label: string; sub: string }[] = [
  { key: 'realtime', icon: Zap,    label: 'Tempo Real', sub: 'Google Vision API' },
  { key: 'manual',   icon: Pencil, label: 'Manual',     sub: 'Digite o código' },
]

export default function ScanPage() {
  const [active, setActive] = useState<ActivePanel>(null)
  const [result, setResult] = useState<string[] | null>(null)
  const [resultSource, setResultSource] = useState('')
  const [manualCode, setManualCode] = useState('')
  const [manualCodes, setManualCodes] = useState<ManualStickerWithStatus[]>([])
  const [manualPreviewMode, setManualPreviewMode] = useState(false)
  const [savingManual, setSavingManual] = useState(false)
  const [helpVisible, setHelpVisible] = useState(false)
  const { saveScannedStickers, entries, missing } = useInventarioStore()

  const handleCodes = useCallback((codes: string[], source: string) => {
    setResultSource(source)
    setResult(codes)
  }, [])

  const handleConfirm = useCallback(async (codes: string[]) => {
    const saved = await saveScannedStickers(codes)
    toast.success(`${saved} figurinha${saved !== 1 ? 's' : ''} salva${saved !== 1 ? 's' : ''}!`)
    setResult(null)
    setActive(null)
  }, [saveScannedStickers])

  const handleManualConfirm = useCallback(async () => {
    if (savingManual || manualCodes.length === 0) return
    setSavingManual(true)
    try {
      const codes = manualCodes.map(c => c.code)
      const count = await saveScannedStickers(codes)
      toast.success(`${count} figurinha${count !== 1 ? 's' : ''} adicionada${count !== 1 ? 's' : ''}!`)
      setManualCodes([])
      setManualPreviewMode(false)
      setActive(null)
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Erro ao salvar.')
    } finally {
      setSavingManual(false)
    }
  }, [manualCodes, savingManual, saveScannedStickers])

  const normalizeCode = (raw: string): string =>
    raw.trim().toUpperCase().replace(/^([A-Z]{2,3})[\s\-]*([0-9]{1,2})$/, '$1 $2')

  const enrichCode = useCallback(async (code: string): Promise<ManualStickerWithStatus> => {
    const entry = entries.find(e => e.sticker_code === code)

    let status: 'new' | 'duplicate' | 'pasted' = 'new'
    if (entry) {
      status = entry.is_pasted ? 'pasted' : 'duplicate'
    }

    return { code, status }
  }, [entries])

  const addManual = useCallback(async () => {
    const code = normalizeCode(manualCode)
    if (!code) return

    if (manualCodes.some(c => c.code === code)) {
      toast('Código já adicionado', { icon: '⚠️' })
      setManualCode('')
      return
    }

    const enriched = await enrichCode(code)
    setManualCodes((p) => [...p, enriched])
    setManualCode('')
  }, [manualCode, manualCodes, normalizeCode, enrichCode])

  // ✅ NOVO: Preview do fluxo manual
  if (manualPreviewMode && active === 'manual') {
    const newCount = manualCodes.filter(d => d.status === 'new').length
    const repetidasCount = manualCodes.filter(d => d.status !== 'new').length

    return (
      <div className="min-h-screen bg-ink-900 px-4 pt-safe pb-24">
        {/* Header */}
        <div className="flex items-center justify-between py-5">
          <button
            onClick={() => setManualPreviewMode(false)}
            className="flex items-center gap-2 text-sm font-semibold text-ink-400 hover:text-ink-300 transition"
          >
            <ChevronLeft size={18} />
            Voltar
          </button>
          <div className="text-xs font-body text-ink-500 tracking-wide">👁 PREVIEW</div>
          <div className="text-xs text-ink-500">{manualCodes.length}</div>
        </div>

        {/* Status Tags */}
        <div className="flex gap-2 flex-wrap mb-4">
          {newCount > 0 && (
            <span className="text-xs font-body px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>
              ✓ {newCount} nova{newCount !== 1 ? 's' : ''}
            </span>
          )}
          {repetidasCount > 0 && (
            <span className="text-xs font-body px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
              🔁 {repetidasCount} repetida{repetidasCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Lista de Figurinhas */}
        <div className="space-y-2 mb-6">
          {manualCodes.map(item => {
            const entry = entries.find(e => e.sticker_code === item.code)
            const catalogEntry = missing.find(m => m.sticker_code === item.code)
            const countryName = entry?.country_name ?? catalogEntry?.country_name ?? item.code
            const currentQty = entry?.quantity_owned ?? 0

            let statusColor = '#3B82F6'
            let statusBg = 'rgba(59,130,246,0.08)'
            let statusLabel = 'Nova'
            let statusSymbol = '✅'

            if (item.status === 'duplicate' || item.status === 'pasted') {
              statusColor = '#F59E0B'
              statusBg = 'rgba(245,158,11,0.08)'
              statusLabel = 'Repetida'
              statusSymbol = '🔁'
            }

            return (
              <div key={item.code} className="flex items-center gap-3 p-3 bg-ink-800/30 rounded-lg border border-ink-700/30">
                <div className="w-12 h-9 rounded-lg bg-ink-700 flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-xs text-ink-100 font-bold">{item.code}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-ink-100 truncate">{countryName}</p>
                  <p className="text-ink-500 text-xs">
                    {item.status === 'new' ? 'Pode ser colada' : item.status === 'pasted' ? 'Já colada' : `Já tem ${currentQty} · será repetida`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-body px-2 py-1 rounded-full" style={{ backgroundColor: statusBg, color: statusColor }}>
                    {statusSymbol} {statusLabel}
                  </span>
                  <button
                    onClick={() => setManualCodes((prev) => prev.filter((x) => x.code !== item.code))}
                    className="w-6 h-6 flex items-center justify-center text-ink-600 hover:text-scarlet-400 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Botões Ação */}
        <div className="flex gap-2">
          <button
            onClick={() => setManualCodes([])}
            className="flex-1 py-2.5 bg-ink-700 hover:bg-ink-600 rounded-lg font-semibold text-sm text-ink-300 transition"
          >
            Limpar
          </button>
          <button
            onClick={() => void handleManualConfirm()}
            disabled={savingManual}
            className={[
              'flex-1 py-2.5 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-2',
              savingManual
                ? 'bg-ink-700 text-ink-500 cursor-not-allowed'
                : 'bg-gold-500 text-ink-900 hover:bg-gold-600',
            ].join(' ')}
          >
            {savingManual ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-ink-900/30 border-t-ink-900 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <PackagePlus size={16} />
                Adicionar no estoque ({manualCodes.length})
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  if (result !== null) {
    return (
      <div className="fixed inset-0 z-50 bg-ink-900">
        <ScanResultScreen
          codes={result}
          sourceLabel={resultSource}
          onConfirm={handleConfirm}
          onCancel={() => setResult(null)}
        />
      </div>
    )
  }

  if (active === 'realtime') {
    return (
      <GoogleVisionScanner
        stickers={entries}
        onConfirm={(c) => handleCodes(c, 'Tempo Real')}
        onClose={() => setActive(null)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-ink-900 px-4 pt-safe pb-24">
      <div className="flex items-start justify-between py-5">
        <div>
          <h1 className="font-display text-3xl text-gold-400 tracking-wide">SCAN</h1>
          <p className="text-ink-500 text-sm font-body mt-1">Escolha como adicionar figurinhas</p>
        </div>
        <button
          onClick={() => setHelpVisible(true)}
          className="w-10 h-10 rounded-full bg-white/6 flex items-center justify-center text-ink-400 hover:bg-white/10 transition-colors mt-2 flex-shrink-0"
          aria-label="Ajuda"
        >
          <span className="font-heading font-bold text-base leading-none">?</span>
        </button>
      </div>
      <HelpModal visible={helpVisible} onClose={() => setHelpVisible(false)} screen="scan" />

      <div className="space-y-3">
        {PANELS.map(({ key, icon: Icon, label, sub }) => {
          const isOpen = active === key
          return (
            <div key={key} className="bg-ink-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setActive(isOpen ? null : key)}
                className="w-full flex items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-white/4"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  key === 'realtime' ? 'bg-gold-500' : 'bg-ink-700'
                }`}>
                  <Icon size={20} className={key === 'realtime' ? 'text-ink-900' : 'text-ink-300'} />
                </div>
                <div className="flex-1">
                  <p className="font-heading font-semibold text-ink-100">{label}</p>
                  <p className="text-ink-500 text-xs font-body">{sub}</p>
                </div>
                <ChevronDown
                  size={18}
                  className={`text-ink-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="border-t border-ink-700/50">
                  {key === 'manual' && (
                    <div className="p-4 space-y-3">
                      <div className="flex gap-2">
                        <input
                          value={manualCode}
                          onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === 'Enter' && void addManual()}
                          placeholder="Ex: BRA 7"
                          className="flex-1 bg-ink-700 border border-ink-600 rounded-lg px-3 py-2.5 font-mono text-sm text-ink-100 placeholder:text-ink-600 focus:outline-none focus:border-gold-500"
                        />
                        <button
                          onClick={() => void addManual()}
                          className="w-11 h-11 bg-gold-500 rounded-lg flex items-center justify-center flex-shrink-0"
                        >
                          <Plus size={18} className="text-ink-900" />
                        </button>
                      </div>
                      {manualCodes.length > 0 && (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {manualCodes.map((item) => {
                              const symbol = item.status === 'new' ? '✅' : '🔁'
                              return (
                                <span
                                  key={item.code}
                                  onClick={() => setManualCodes((prev) => prev.filter((x) => x.code !== item.code))}
                                  className="px-2.5 py-1 bg-ink-700 text-ink-200 rounded-full font-mono text-xs cursor-pointer hover:bg-scarlet-500/20 hover:text-scarlet-400 transition-colors"
                                >
                                  {item.code}{symbol} ×
                                </span>
                              )
                            })}
                          </div>
                          <button
                            onClick={() => setManualPreviewMode(true)}
                            className="w-full py-2.5 bg-gold-500 hover:bg-gold-600 rounded-lg font-heading font-bold text-ink-900 text-sm transition-colors"
                          >
                            Ver resultado ({manualCodes.length})
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
