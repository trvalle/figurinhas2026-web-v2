'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft } from 'lucide-react'
import { useRealtimeScanner } from '@/hooks/useRealtimeScanner'
import { useInventarioStore } from '@/stores/inventarioStore'
import { StickerOverlay } from '@/components/scanner/StickerOverlay'
import type { DetectedSticker as HookDetectedSticker } from '@/hooks/useRealtimeScanner'
import type { DetectedSticker, StickerDetectionStatus } from '@/services/realtimeScanner'
import toast from 'react-hot-toast'

interface PRDScannerProps {
  stickers: any[]
  onConfirm: (codes: string[]) => void
  onClose: () => void
}

function mapHookStatusToOverlayStatus(hookStatus: string): StickerDetectionStatus {
  switch (hookStatus) {
    case 'pasted':
      return 'colada'
    case 'duplicate':
      return 'repetida'
    case 'new':
    case 'owned':
    default:
      return 'faltante'
  }
}

export default function PRDScanner({ stickers, onConfirm, onClose }: PRDScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [detected, setDetected] = useState<DetectedSticker[]>([])
  const [saving, setSaving] = useState(false)
  const [isActive, setIsActive] = useState(false)

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
              console.warn('[PRDScanner] Play error:', err)
            })
          }
          setIsActive(true)
          setCameraError(null)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Acesso à câmera negado'
        setCameraError(msg)
        setIsActive(false)
      }
    }

    startCamera()

    return () => {
      setIsActive(false)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Hook de scanner (usa videoRef com OpenCV calibrado + Tesseract)
  const { detected: hookDetected, readyState } = useRealtimeScanner(
    videoRef as React.RefObject<HTMLVideoElement>,
    stickers,
    isActive && !cameraError
  )

  // Atualizar lista acumulada (converter tipos do hook para overlay)
  useEffect(() => {
    setDetected(prev => {
      const merged = new Map(prev.map(d => [d.code, d]))
      for (const d of hookDetected) {
        const converted: DetectedSticker = {
          code: d.code,
          status: mapHookStatusToOverlayStatus(d.status),
        }
        merged.set(d.code, converted)
      }
      return [...merged.values()]
    })
  }, [hookDetected])

  const handleRemoveSticker = useCallback((code: string) => {
    setDetected(prev => prev.filter(x => x.code !== code))
  }, [])

  const handleClearAll = useCallback(() => {
    setDetected([])
  }, [])

  const handleSave = useCallback(async () => {
    if (saving || detected.length === 0) return
    setSaving(true)
    try {
      const count = await saveScannedStickers(detected.map(d => d.code))
      toast.success(`${count} figurinha${count !== 1 ? 's' : ''} adicionada${count !== 1 ? 's' : ''}!`)
      onConfirm(detected.map(d => d.code))
      setDetected([])
    } catch (error) {
      console.error('[PRDScanner] Save error:', error)
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }, [detected, saving, saveScannedStickers, onConfirm])

  const isLoading = readyState === 'loading_opencv' || readyState === 'loading_ocr'
  const isError = readyState === 'error'

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
        <div className="text-xs font-body text-ink-500 tracking-wide">🔬 PRD SCANNER (Calibrado)</div>
        <div className="text-xs text-ink-500">
          {isLoading ? '⟳' : isError ? '⚠️' : detected.length > 0 ? `${detected.length}` : '—'}
        </div>
      </div>

      {/* Câmera */}
      <div className="flex-1 relative bg-black overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Overlay com status dos stickers detectados */}
        {detected.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            <StickerOverlay detected={detected} />
          </div>
        )}

        {/* Estado de carregamento */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gold-400 font-semibold text-sm">
                {readyState === 'loading_opencv' ? 'Carregando OpenCV...' : 'Inicializando OCR...'}
              </p>
            </div>
          </div>
        )}

        {/* Erro */}
        {(isError || cameraError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="text-center">
              <p className="text-red-400 font-semibold mb-2">⚠️ Erro</p>
              <p className="text-ink-400 text-sm">{cameraError || 'Erro ao inicializar scanner'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Painel de controle e resultado */}
      {!isLoading && !isError && !cameraError && (
        <div className="bg-ink-900/50 border-t border-ink-700 space-y-3 p-4">
          {detected.length > 0 && (
            <div className="max-h-32 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {detected.map(d => (
                  <div
                    key={d.code}
                    className="px-2.5 py-1 bg-ink-700 rounded-full text-xs font-mono flex items-center gap-2"
                  >
                    <span className="text-ink-200">{d.code}</span>
                    <span className={`text-xs font-semibold ${
                      d.status === 'colada' ? 'text-green-400' :
                      d.status === 'repetida' ? 'text-amber-400' :
                      'text-blue-400'
                    }`}>
                      {d.status === 'colada' ? '✓' : d.status === 'repetida' ? '2x' : '✦'}
                    </span>
                    <button
                      onClick={() => handleRemoveSticker(d.code)}
                      className="ml-1 text-ink-500 hover:text-red-400 transition"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {detected.length > 0 && (
              <>
                <button
                  onClick={handleClearAll}
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
              </>
            )}
            {detected.length === 0 && (
              <div className="text-xs text-ink-500 text-center w-full py-2">
                Aponte a câmera para as figurinhas...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
