'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft } from 'lucide-react'
import { useInventarioStore } from '@/stores/inventarioStore'
import { StickerOverlay } from '@/components/scanner/StickerOverlay'
import type { DetectedSticker, StickerDetectionStatus } from '@/services/realtimeScanner'
import toast from 'react-hot-toast'

interface PRDScannerProps {
  stickers: any[]
  onConfirm: (codes: string[]) => void
  onClose: () => void
}

export default function PRDScanner({ stickers, onConfirm, onClose }: PRDScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [detected, setDetected] = useState<DetectedSticker[]>([])
  const [saving, setSaving] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const entries = useInventarioStore((s) => s.entries)
  const { saveWithStatus } = useInventarioStore()

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

  // Capturar frame do vídeo e processar com OCR
  const capture = useCallback(async () => {
    if (capturing || !videoRef.current || !canvasRef.current) return
    setCapturing(true)
    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')!.drawImage(video, 0, 0)

      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => b ? res(b) : rej(new Error('Canvas empty')), 'image/jpeg', 0.9)
      )

      const { processFrame } = await import('@/services/realtimeScanner')
      const frame = await processFrame(canvas, entries, blob)

      setDetected(prev => {
        const merged = new Map(prev.map(d => [d.code, d]))
        for (const d of frame.detected) merged.set(d.code, d)
        return [...merged.values()]
      })

      if (frame.detected.length === 0) {
        toast('Nenhuma figurinha identificada.', { icon: '📷' })
      } else {
        toast.success(`+${frame.detected.length} figurinha(s) detectada(s)!`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error(msg)
    } finally {
      setCapturing(false)
    }
  }, [capturing, entries])

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
      const count = await saveWithStatus(detected.map(d => ({ code: d.code, status: d.status })))
      toast.success(`${count} figurinha${count !== 1 ? 's' : ''} adicionada${count !== 1 ? 's' : ''}!`)
      onConfirm(detected.map(d => d.code))
      setDetected([])
    } catch (error) {
      console.error('[PRDScanner] Save error:', error)
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }, [detected, saving, saveWithStatus, onConfirm])

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
        <div className="text-xs font-body text-ink-500 tracking-wide">🔬 PRD SCANNER</div>
        <div className="text-xs text-ink-500">
          {capturing ? '⟳' : detected.length > 0 ? `${detected.length}` : '—'}
        </div>
      </div>

      {/* Câmera */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {cameraError ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-ink-400 text-sm text-center px-4">{cameraError}</p>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Painel de controle */}
      {!cameraError && (
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
              <button
                onClick={() => void capture()}
                disabled={capturing}
                className="w-full py-3 bg-gold-500 hover:bg-gold-600 disabled:opacity-40 rounded-lg font-semibold text-sm text-ink-900 transition"
              >
                {capturing ? '⟳ Capturando...' : '📷 Capturar'}
              </button>
            )}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
