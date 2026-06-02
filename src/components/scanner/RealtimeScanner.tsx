'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Zap, ChevronLeft } from 'lucide-react'
import { useRealtimeScanner } from '@/hooks/useRealtimeScanner'
import { useInventarioStore } from '@/stores/inventarioStore'
import type { DetectedSticker } from '@/hooks/useRealtimeScanner'
import toast from 'react-hot-toast'

interface RealtimeScannerProps {
  stickers: any[]
  onClose: () => void
}

export default function RealtimeScanner({ stickers, onClose }: RealtimeScannerProps) {
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
              console.warn('[RealtimeScanner] Play error:', err)
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

  // Hook de scanner (OCR em tempo real)
  const { detected: hookDetected, readyState } = useRealtimeScanner(
    videoRef as React.RefObject<HTMLVideoElement>,
    stickers,
    isActive && !cameraError
  )

  // Atualizar lista acumulada
  useEffect(() => {
    setDetected(prev => {
      const merged = new Map(prev.map(d => [d.code, d]))
      for (const d of hookDetected) {
        merged.set(d.code, d)
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
      setDetected([])
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }, [saving, detected, saveScannedStickers])

  const newCount = detected.filter(d => d.status === 'new').length
  const repetidasCount = detected.filter(d => d.status !== 'new').length

  const statusMessage = {
    loading_opencv: 'Carregando OpenCV.js...',
    loading_ocr: 'Iniciando OCR...',
    ready: 'Aponte para as figurinhas',
    scanning: 'Analisando frame...',
    error: 'Erro ao iniciar scanner',
  }[readyState]

  return (
    <div className="flex flex-col h-screen bg-ink-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-2 py-3 border-b border-ink-700 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-ink-400 hover:text-ink-200 transition-colors px-2 py-1"
          aria-label="Voltar"
        >
          <ChevronLeft size={22} />
          <span className="font-body text-sm">Voltar</span>
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Zap size={18} className="text-gold-400" />
          <h2 className="font-heading font-bold text-ink-100">Tempo Real</h2>
          <span className="text-gold-400 text-xs font-body">{statusMessage}</span>
        </div>
      </div>

      {/* Status Tags */}
      {detected.length > 0 && (
        <div className="px-4 py-2 bg-ink-800/50 flex-shrink-0 flex gap-3 flex-wrap">
          {newCount > 0 && (
            <span
              className="text-xs font-body px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}
            >
              ✦ {newCount} para colar
            </span>
          )}
          {repetidasCount > 0 && (
            <span
              className="text-xs font-body px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
            >
              🔁 {repetidasCount} repetida{repetidasCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Chips de Figurinhas */}
      <div className="flex gap-2 px-4 py-2 bg-ink-800/30 flex-shrink-0 overflow-x-auto min-h-[44px] items-center">
        {detected.length === 0
          ? <span className="text-ink-500 text-xs font-body">Aponte para as figurinhas</span>
          : <>
              {detected.map(d => {
                let symbol = '✦'
                let bgColor = 'rgba(59,130,246,0.15)'
                let textColor = '#3B82F6'

                if (d.status === 'duplicate') {
                  symbol = '🔁'
                  bgColor = 'rgba(245,158,11,0.15)'
                  textColor = '#F59E0B'
                } else if (d.status === 'pasted') {
                  symbol = '✓'
                  bgColor = 'rgba(74,222,128,0.15)'
                  textColor = '#4ADE80'
                }

                return (
                  <span
                    key={d.code}
                    className="flex-shrink-0 text-xs font-mono px-2.5 py-1 rounded-lg flex items-center gap-1"
                    style={{ backgroundColor: bgColor, color: textColor }}
                  >
                    {d.code}
                    <span>{symbol}</span>
                  </span>
                )
              })}
              <button
                onClick={handleClearAll}
                className="flex-shrink-0 text-xs font-body text-ink-600 hover:text-scarlet-400 transition-colors ml-1 px-1"
              >
                ✕ Limpar
              </button>
            </>}
      </div>

      {/* Video */}
      <div className="flex-1 flex items-center justify-center bg-ink-950 px-4 py-safe">
        <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-black relative" style={{ aspectRatio: '3/4' }}>
          {cameraError ? (
            <div className="flex items-center justify-center h-full px-6">
              <p className="text-ink-400 font-body text-sm text-center">{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                onError={(e) => console.warn('[video] Error:', e)}
              />
              <div
                className="absolute inset-0 border-2 rounded-2xl pointer-events-none transition-colors duration-300"
                style={{ borderColor: readyState === 'scanning' ? 'rgba(245,158,11,0.5)' : 'transparent' }}
              />
            </>
          )}
        </div>
      </div>

      {/* Botão Add(n) */}
      {detected.length > 0 && (
        <div className="px-4 pb-3 flex-shrink-0">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full py-3.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-40 rounded-xl font-heading font-bold text-lg text-ink-900 transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-5 h-5 rounded-full border-2 border-ink-900/30 border-t-ink-900 animate-spin" />
                Salvando…
              </>
            ) : (
              <>
                <Zap size={20} />
                Add ({detected.length})
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
