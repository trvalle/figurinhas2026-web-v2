'use client'
import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import toast from 'react-hot-toast'
import { Zap, Pencil, Plus, ChevronDown } from 'lucide-react'
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
  const [helpVisible, setHelpVisible] = useState(false)
  const { saveScannedStickers, entries } = useInventarioStore()

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
                            onClick={() => handleCodes(manualCodes.map(c => c.code), 'Manual')}
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
