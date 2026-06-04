'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Zap, PackagePlus, ChevronLeft, Upload } from 'lucide-react'
import { useInventarioStore } from '@/stores/inventarioStore'
import { useOCRProviderStore } from '@/stores/ocrProviderStore'
import { extractAndValidateCodes, loadCatalogCache } from '@/services/ocr'
import { getOCRProvider, listOCRProviders } from '@/services/ocrProviders'
import toast from 'react-hot-toast'

interface DetectedSticker {
  code: string
  status: 'new' | 'duplicate' | 'pasted'
  countryName: string
  currentQty: number
}

interface GoogleVisionScannerProps {
  stickers: any[]
  onConfirm: (codes: string[]) => void
  onClose: () => void
}

export default function GoogleVisionScanner({ stickers, onConfirm, onClose }: GoogleVisionScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [detected, setDetected] = useState<DetectedSticker[]>([])
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [mode, setMode] = useState<'camera' | 'gallery'>('camera')
  const [showPreview, setShowPreview] = useState(false)

  const { saveScannedStickers, entries, missing } = useInventarioStore()
  const { selectedProvider, setSelectedProvider } = useOCRProviderStore()
  const ocrProvider = getOCRProvider(selectedProvider)

  // Enriquecer código com status e país
  const enrichDetected = useCallback(async (codes: string[]) => {
    const catalog = await loadCatalogCache()
    const catalogMap = new Map(catalog.map(c => [c.sticker_code, c]))

    return codes.map(code => {
      const entry = entries.find(e => e.sticker_code === code)
      const catalogEntry = catalogMap.get(code)

      let status: 'new' | 'duplicate' | 'pasted' = 'new'
      if (entry) {
        status = entry.is_pasted ? 'pasted' : 'duplicate'
      }

      return {
        code,
        status,
        countryName: entry?.country_name ?? catalogEntry?.country_name ?? code,
        currentQty: entry?.quantity_owned ?? 0,
      }
    })
  }, [entries])

  // Inicializar câmera
  useEffect(() => {
    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Câmera não suportada neste navegador.')
          return
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(err => {
              console.warn('[GoogleVisionScanner] Play error:', err)
            })
          }
          setCameraError(null)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Acesso à câmera negado'
        setCameraError(msg)
      }
    }

    if (mode === 'camera') {
      startCamera()
    }

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [mode])

  const captureAndAnalyze = useCallback(async () => {
    if (processing || !videoRef.current || !canvasRef.current) return

    setProcessing(true)
    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0)

      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg')
      })

      if (!blob) {
        toast.error('Erro ao capturar imagem')
        return
      }

      const text = await ocrProvider.recognizeText(blob)
      const { codes } = await extractAndValidateCodes(text)

      if (codes.length === 0) {
        toast('Nenhuma figurinha identificada. Tente outra posição.', { icon: '📷' })
      } else {
        // ✅ NOVO: Enriquecer com status
        const enriched = await enrichDetected(codes)
        setDetected(prev => {
          const merged = new Map(prev.map(d => [d.code, d]))
          for (const d of enriched) {
            merged.set(d.code, d)
          }
          return [...merged.values()]
        })
        toast.success(`${codes.length} figurinha${codes.length !== 1 ? 's' : ''} identificada${codes.length !== 1 ? 's' : ''}`)
      }
    } catch (error) {
      console.error('[GoogleVisionScanner] Error:', error)
      toast.error('Erro ao analisar imagem. Tente novamente.')
    } finally {
      setProcessing(false)
    }
  }, [processing, enrichDetected, ocrProvider])

  const handleGalleryUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setProcessing(true)
    try {
      const text = await ocrProvider.recognizeText(file)
      const { codes } = await extractAndValidateCodes(text)

      if (codes.length === 0) {
        toast('Nenhuma figurinha identificada nesta imagem.')
      } else {
        // ✅ NOVO: Enriquecer com status
        const enriched = await enrichDetected(codes)
        setDetected(prev => {
          const merged = new Map(prev.map(d => [d.code, d]))
          for (const d of enriched) {
            merged.set(d.code, d)
          }
          return [...merged.values()]
        })
        toast.success(`${codes.length} figurinha${codes.length !== 1 ? 's' : ''} identificada${codes.length !== 1 ? 's' : ''}`)
      }
    } catch (error) {
      console.error('[GoogleVisionScanner] Gallery upload error:', error)
      toast.error('Erro ao analisar imagem.')
    } finally {
      setProcessing(false)
      event.target.value = ''
    }
  }, [enrichDetected, ocrProvider])

  const handleShowPreview = useCallback(() => {
    setShowPreview(true)
  }, [])

  const handleAddToStock = useCallback(async () => {
    if (saving || detected.length === 0) return
    setSaving(true)
    try {
      const codes = detected.map(d => d.code)
      const count = await saveScannedStickers(codes)
      toast.success(`${count} figurinha${count !== 1 ? 's' : ''} adicionada${count !== 1 ? 's' : ''}!`)
      onConfirm(codes)
      setDetected([])
      setShowPreview(false)
    } catch (error) {
      console.error('[GoogleVisionScanner] Save error:', error)
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }, [detected, saving, saveScannedStickers, onConfirm])

  const handleRemove = useCallback((code: string) => {
    setDetected(prev => prev.filter(d => d.code !== code))
  }, [])

  const newCount = detected.filter(d => d.status === 'new').length
  const repetidasCount = detected.filter(d => d.status === 'duplicate').length
  const coladasCount = detected.filter(d => d.status === 'pasted').length

  // ✅ NOVO: Tela de Preview
  if (showPreview) {
    return (
      <div className="fixed inset-0 z-[100] bg-ink-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ink-700 bg-ink-900/50">
          <button
            onClick={() => setShowPreview(false)}
            className="flex items-center gap-2 text-sm font-semibold text-ink-400 hover:text-ink-300 transition"
          >
            <ChevronLeft size={18} />
            Voltar
          </button>
          <div className="text-xs font-body text-ink-500 tracking-wide">👁 PREVIEW</div>
          <div className="text-xs text-ink-500">{detected.length}</div>
        </div>

        {/* Status Tags */}
        <div className="px-4 py-2 flex gap-2 flex-wrap flex-shrink-0 border-b border-ink-700/30 bg-ink-800/50">
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
          {coladasCount > 0 && (
            <span className="text-xs font-body px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ADE80' }}>
              ✔ {coladasCount} colada{coladasCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Lista de Figurinhas */}
        <div className="overflow-y-auto flex-1">
          <div className="divide-y divide-ink-700/20">
            {detected.map(d => {
              let statusColor = '#3B82F6'
              let statusBg = 'rgba(59,130,246,0.08)'
              let statusLabel = 'Nova'
              let statusSymbol = '✅'

              if (d.status === 'duplicate' || d.status === 'pasted') {
                statusColor = '#F59E0B'
                statusBg = 'rgba(245,158,11,0.08)'
                statusLabel = 'Repetida'
                statusSymbol = '🔁'
              }

              return (
                <div key={d.code} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-12 h-9 rounded-lg bg-ink-700 flex items-center justify-center flex-shrink-0">
                    <span className="font-mono text-xs text-ink-100 font-bold">{d.code}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-ink-100 truncate">{d.countryName}</p>
                    <p className="text-ink-500 text-xs">
                      {d.status === 'new' ? 'Pode ser colada' : d.status === 'pasted' ? 'Já colada' : `Já tem ${d.currentQty} · será repetida`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-body px-2 py-1 rounded-full" style={{ backgroundColor: statusBg, color: statusColor }}>
                      {statusSymbol} {statusLabel}
                    </span>
                    <button
                      onClick={() => handleRemove(d.code)}
                      className="w-6 h-6 flex items-center justify-center text-ink-600 hover:text-scarlet-400 transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Botões Ação */}
        <div className="flex gap-2 p-4 border-t border-ink-700 flex-shrink-0">
          <button
            onClick={() => setDetected([])}
            className="flex-1 py-2.5 bg-ink-700 hover:bg-ink-600 rounded-lg font-semibold text-sm text-ink-300 transition"
          >
            Limpar
          </button>
          <button
            onClick={() => void handleAddToStock()}
            disabled={saving}
            className={[
              'flex-1 py-2.5 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-2',
              saving
                ? 'bg-ink-700 text-ink-500 cursor-not-allowed'
                : 'bg-gold-500 text-ink-900 hover:bg-gold-600',
            ].join(' ')}
          >
            {saving ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-ink-900/30 border-t-ink-900 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <PackagePlus size={16} />
                Adicionar no estoque ({detected.length})
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-ink-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-ink-700 bg-ink-900/50">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-semibold text-ink-400 hover:text-ink-300 transition"
        >
          <ChevronLeft size={18} />
          Voltar
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-body text-ink-500 tracking-wide">⚡ TEMPO REAL</span>
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value as any)}
            className="text-xs bg-ink-800 border border-ink-700 rounded px-2 py-1 text-ink-200 hover:border-gold-500 transition focus:outline-none focus:border-gold-500"
          >
            {listOCRProviders().map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-ink-500">{detected.length > 0 ? `${detected.length}` : '—'}</div>
      </div>

      {/* Modo Switch */}
      <div className="flex gap-2 p-3 border-b border-ink-700 bg-ink-800/50">
        <button
          onClick={() => setMode('camera')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            mode === 'camera'
              ? 'bg-gold-500 text-ink-900'
              : 'bg-ink-700 text-ink-300 hover:bg-ink-600'
          }`}
        >
          📷 Câmera
        </button>
        <button
          onClick={() => setMode('gallery')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            mode === 'gallery'
              ? 'bg-gold-500 text-ink-900'
              : 'bg-ink-700 text-ink-300 hover:bg-ink-600'
          }`}
        >
          🖼️ Galeria
        </button>
      </div>

      {/* Conteúdo */}
      {mode === 'camera' ? (
        <>
          <div className="flex-1 relative bg-black overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <div className="text-center">
                  <p className="text-red-400 font-semibold mb-2">⚠️ Erro</p>
                  <p className="text-ink-400 text-sm">{cameraError}</p>
                </div>
              </div>
            )}

            {selectedProvider === 'tesseract' && !processing && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">

                {/* Escurecimento nas bordas — destaca o centro */}
                <div className="absolute inset-0 bg-black/40"
                     style={{
                       maskImage: 'radial-gradient(ellipse 60% 40% at center, transparent 55%, black 100%)',
                       WebkitMaskImage: 'radial-gradient(ellipse 60% 40% at center, transparent 55%, black 100%)'
                     }}
                />

                {/* Retângulo guia — proporção da figurinha (aprox 3:4) */}
                <div className="relative border-2 border-white/80 rounded-lg"
                     style={{ width: '65vw', height: '87vw', maxWidth: '280px', maxHeight: '373px' }}>

                  {/* Cantos destacados */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-yellow-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-yellow-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-yellow-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-yellow-400 rounded-br-lg" />

                  {/* Indicador do badge — canto superior direito */}
                  <div className="absolute -top-7 right-0 flex items-center gap-1">
                    <span className="text-yellow-400 text-xs font-bold bg-black/60 px-2 py-0.5 rounded">
                      código aqui
                    </span>
                    <span className="text-yellow-400 text-sm">↓</span>
                  </div>
                </div>

                {/* Instrução embaixo do guia */}
                <p className="mt-4 text-white text-sm font-medium bg-black/60 px-3 py-1.5 rounded-full">
                  Aproxime até a figurinha preencher o guia
                </p>

              </div>
            )}
          </div>

          <div className="flex gap-3 p-4 bg-ink-900/50 border-t border-ink-700">
            <button
              onClick={() => void captureAndAnalyze()}
              disabled={processing || !!cameraError}
              className={[
                'flex-1 py-3 rounded-lg font-semibold text-sm transition',
                processing || cameraError
                  ? 'bg-ink-700 text-ink-500 cursor-not-allowed'
                  : 'bg-gold-500 text-ink-900 hover:bg-gold-400',
              ].join(' ')}
            >
              {processing ? '⟳ ANALISANDO...' : '⊙ CAPTURAR'}
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <label className="flex flex-col items-center gap-4 cursor-pointer">
            <div className="w-20 h-20 rounded-full bg-gold-500/20 flex items-center justify-center">
              <Upload size={40} className="text-gold-400" />
            </div>
            <div className="text-center">
              <p className="text-ink-100 font-semibold">Selecionar imagem</p>
              <p className="text-ink-500 text-sm mt-1">Clique para escolher de sua galeria</p>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => void handleGalleryUpload(e)}
              disabled={processing}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* ✅ NOVO: Preview com Status */}
      {detected.length > 0 && (
        <div className="bg-ink-800/50 border-t border-ink-700 flex flex-col max-h-96">
          {/* Status Tags */}
          <div className="px-4 py-2 flex gap-2 flex-wrap flex-shrink-0 border-b border-ink-700/30">
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
            {coladasCount > 0 && (
              <span className="text-xs font-body px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ADE80' }}>
                ✔ {coladasCount} colada{coladasCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>


          {/* ✅ NOVO: Listagem com Símbolos */}
          {detected.length > 0 && (
            <div className="px-4 py-3 bg-ink-800/50 border-t border-ink-700 flex-shrink-0">
              <p className="text-xs text-ink-500 font-body mb-2">Detectadas:</p>
              <div className="flex flex-wrap gap-1">
                {detected.map(d => (
                  <span key={d.code} className="text-xs font-mono px-2 py-1 rounded-lg bg-ink-700 text-ink-200">
                    {d.code}{d.status === 'new' ? '✅' : '🔁'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Botões Ação */}
          <div className="flex gap-2 p-4 border-t border-ink-700 flex-shrink-0">
            <button
              onClick={() => setDetected([])}
              className="flex-1 py-2.5 bg-ink-700 hover:bg-ink-600 rounded-lg font-semibold text-sm text-ink-300 transition"
            >
              Limpar
            </button>
            <button
              onClick={() => void handleShowPreview()}
              disabled={detected.length === 0}
              className={[
                'flex-1 py-2.5 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-2',
                detected.length === 0
                  ? 'bg-ink-700 text-ink-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700',
              ].join(' ')}
            >
              👁 Visualizar ({detected.length})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
