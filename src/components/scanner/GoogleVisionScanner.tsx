'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Zap, PackagePlus, ChevronLeft, Upload } from 'lucide-react'
import { useInventarioStore } from '@/stores/inventarioStore'
import { recognizeText, extractAndValidateCodes, loadCatalogCache } from '@/services/ocr'
import toast from 'react-hot-toast'

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
  const [detected, setDetected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [mode, setMode] = useState<'camera' | 'gallery'>('camera')

  const { saveScannedStickers } = useInventarioStore()

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

      // Usar Google Vision API via Edge Function
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg')
      })

      if (!blob) {
        toast.error('Erro ao capturar imagem')
        return
      }

      // Chamar Edge Function 'ocr'
      const text = await recognizeText(blob)
      const { codes } = await extractAndValidateCodes(text)

      if (codes.length === 0) {
        toast('Nenhuma figurinha identificada. Tente outra posição.', { icon: '📷' })
      } else {
        setDetected(prev => {
          const merged = new Set([...prev, ...codes])
          return [...merged]
        })
        toast.success(`${codes.length} figurinha${codes.length !== 1 ? 's' : ''} identificada${codes.length !== 1 ? 's' : ''}`)
      }
    } catch (error) {
      console.error('[GoogleVisionScanner] Error:', error)
      toast.error('Erro ao analisar imagem. Tente novamente.')
    } finally {
      setProcessing(false)
    }
  }, [processing])

  const handleGalleryUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setProcessing(true)
    try {
      const text = await recognizeText(file)
      const { codes } = await extractAndValidateCodes(text)

      if (codes.length === 0) {
        toast('Nenhuma figurinha identificada nesta imagem.')
      } else {
        setDetected(prev => {
          const merged = new Set([...prev, ...codes])
          return [...merged]
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
  }, [])

  const handleSave = useCallback(async () => {
    if (saving || detected.length === 0) return
    setSaving(true)
    try {
      const count = await saveScannedStickers(detected)
      toast.success(`${count} figurinha${count !== 1 ? 's' : ''} adicionada${count !== 1 ? 's' : ''}!`)
      onConfirm(detected)
      setDetected([])
    } catch (error) {
      console.error('[GoogleVisionScanner] Save error:', error)
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }, [detected, saving, saveScannedStickers, onConfirm])

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
        <div className="text-xs font-body text-ink-500 tracking-wide">⚡ TEMPO REAL (Google Vision)</div>
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

      {/* Resultado e botão salvar */}
      {detected.length > 0 && (
        <div className="p-4 bg-ink-800/50 border-t border-ink-700 space-y-3">
          <div className="max-h-24 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {detected.map(code => (
                <span key={code} className="px-2.5 py-1 bg-ink-700 text-ink-200 rounded-full font-mono text-xs">
                  {code}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDetected([])}
              className="flex-1 py-2.5 bg-ink-700 hover:bg-ink-600 rounded-lg font-semibold text-sm text-ink-300 transition"
            >
              Limpar
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className={[
                'flex-1 py-2.5 rounded-lg font-semibold text-sm transition',
                saving
                  ? 'bg-ink-700 text-ink-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700',
              ].join(' ')}
            >
              {saving ? '⟳ SALVANDO...' : `✓ SALVAR (${detected.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
