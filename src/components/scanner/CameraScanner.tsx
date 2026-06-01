'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import { Camera, X, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

interface CameraScannerProps {
  onCodes: (codes: string[]) => void
  onClose: () => void
}

export function CameraScanner({ onCodes, onClose }: CameraScannerProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Câmera não suportada neste navegador.')
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = s
      if (videoRef.current) videoRef.current.srcObject = s
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError'
      setError(
        denied
          ? 'Permissão de câmera negada. Vá em Configurações do Safari → Câmera → Permitir.'
          : 'Não foi possível acessar a câmera. Tente novamente.'
      )
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || processing) return
    setProcessing(true)
    try {
      const video  = videoRef.current
      const canvas = canvasRef.current
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')!.drawImage(video, 0, 0)

      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => b ? res(b) : rej(new Error('Canvas empty')), 'image/jpeg', 0.9)
      )

      const { recognizeText, extractAndValidateCodes } = await import('@/services/ocr')
      const text = await recognizeText(blob)
      const { codes, rawText } = await extractAndValidateCodes(text)

      if (codes.length === 0) {
        const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 60)
        toast.error(
          preview ? `Nenhuma figurinha identificada.\nOCR leu: "${preview}"` : 'Nenhuma figurinha encontrada. Tente aproximar a câmera.',
          { duration: 5000 },
        )
        return
      }

      streamRef.current?.getTracks().forEach((t) => t.stop())
      onCodes(codes)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      toast.error(msg.includes('GOOGLE_CLOUD_VISION_KEY') ? 'API Key não configurada. Veja as instruções de setup.' : 'Erro ao processar imagem. Tente novamente.')
    } finally {
      setProcessing(false)
    }
  }, [processing, onCodes])

  return (
    <div className="flex flex-col h-screen bg-ink-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700 flex-shrink-0">
        <h2 className="font-heading font-bold text-ink-100">Câmera</h2>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-200 transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-ink-950 px-4 pb-safe">
        <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '3/4' }}>
          {error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
              <Camera size={40} className="text-ink-600" />
              <p className="text-ink-400 font-body text-sm">{error}</p>
              <button
                onClick={startCamera}
                className="flex items-center gap-2 px-4 py-2.5 bg-ink-700 hover:bg-ink-600 rounded-lg text-ink-200 text-sm font-body transition-colors"
              >
                <RefreshCw size={16} />
                Tentar novamente
              </button>
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          )}
        </div>

        {!error && (
          <div className="flex flex-col items-center gap-1 pt-3">
            <button
              onClick={capture}
              disabled={processing}
              className="w-16 h-16 rounded-full bg-gold-500 flex items-center justify-center disabled:opacity-50 transition-opacity active:scale-95"
            >
              {processing
                ? <div className="w-6 h-6 rounded-full border-2 border-ink-900/40 border-t-ink-900 animate-spin" />
                : <Camera size={24} className="text-ink-900" />}
            </button>
            {processing && <p className="text-ink-500 text-xs font-body mt-1">Analisando…</p>}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}
