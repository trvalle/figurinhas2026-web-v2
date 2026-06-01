'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Zap, PackagePlus, ChevronLeft } from 'lucide-react' // X mantido para preview sheet
import { StickerOverlay } from './StickerOverlay'
import { ScanTutorialModal } from './ScanTutorialModal'
import { useInventarioStore } from '@/stores/inventarioStore'
import type { DetectedSticker } from '@/services/realtimeScanner'
import toast from 'react-hot-toast'

interface RealtimeScannerProps {
  onConfirm: (codes: string[]) => void
  onClose: () => void
}

export function RealtimeScanner({ onClose }: RealtimeScannerProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [detected,     setDetected]     = useState<DetectedSticker[]>([])
  const [capturing,    setCapturing]    = useState(false)
  const [showPreview,  setShowPreview]  = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const entries             = useInventarioStore((s) => s.entries)
  const missing             = useInventarioStore((s) => s.missing)
  const saveScannedStickers = useInventarioStore((s) => s.saveScannedStickers)
  const entriesRef         = useRef(entries)
  useEffect(() => { entriesRef.current = entries }, [entries])

  useEffect(() => {
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError('Câmera não suportada'); return }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
        })
        streamRef.current = s
        if (videoRef.current) videoRef.current.srcObject = s
      } catch (err) {
        const denied = err instanceof DOMException && err.name === 'NotAllowedError'
        setError(denied ? 'Permissão de câmera negada.' : 'Não foi possível acessar a câmera.')
      }
    }
    start()
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }
  }, [])

  const capture = useCallback(async () => {
    if (capturing || !videoRef.current || !canvasRef.current) return
    setCapturing(true)
    try {
      const video  = videoRef.current
      const canvas = canvasRef.current
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')!.drawImage(video, 0, 0)

      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => b ? res(b) : rej(new Error('Canvas empty')), 'image/jpeg', 0.9)
      )

      const { processFrame } = await import('@/services/realtimeScanner')
      const frame = await processFrame(canvas, entriesRef.current, blob)

      setDetected((prev) => {
        const merged = new Map(prev.map((d) => [d.code, d]))
        for (const d of frame.detected) merged.set(d.code, d)
        return [...merged.values()]
      })

      if (frame.detected.length === 0) {
        toast('Nenhuma figurinha identificada. Tente outra posição.', { icon: '📷' })
      } else {
        const newCount = frame.detected.filter((d) => d.status === 'faltante').length
        if (newCount > 0) toast.success(`+${newCount} nova${newCount !== 1 ? 's' : ''} identificada${newCount !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      toast.error(msg.includes('GOOGLE_CLOUD_VISION_KEY') ? 'API Key não configurada.' : 'Erro ao analisar. Tente novamente.')
    } finally {
      setCapturing(false)
    }
  }, [capturing])

  const stop = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()) }, [])
  const handleClose = useCallback(() => { stop(); onClose() }, [onClose, stop])

  const handleSaveToEstoque = useCallback(async () => {
    if (saving || detected.length === 0) return
    setSaving(true)
    try {
      const count = await saveScannedStickers(detected.map((d) => d.code))
      toast.success(`${count} figurinha${count !== 1 ? 's' : ''} adicionada${count !== 1 ? 's' : ''} ao estoque!`)
      setDetected([])
      setShowPreview(false)
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }, [saving, detected, saveScannedStickers])

  const newCount      = detected.filter((d) => d.status === 'faltante').length
  const repetidasCount = detected.filter((d) => d.status !== 'faltante').length

  // ── Preview bottom sheet ───────────────────────────────────────────────────

  if (showPreview) {
    return (
      <div className="flex flex-col h-screen bg-ink-900">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <PackagePlus size={18} className="text-gold-400" />
            <h2 className="font-heading font-bold text-ink-100">Prévia do estoque</h2>
          </div>
          <button onClick={() => setShowPreview(false)} className="text-ink-400 hover:text-ink-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-4 py-2 bg-ink-800/50 flex-shrink-0 flex gap-3">
          {newCount > 0 && (
            <span className="text-xs font-body px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ADE80' }}>
              {newCount} nova{newCount !== 1 ? 's' : ''}
            </span>
          )}
          {repetidasCount > 0 && (
            <span className="text-xs font-body px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
              {repetidasCount} repetida{repetidasCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-ink-700/30">
            {detected.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <p className="text-ink-500 font-body text-sm">Nenhuma figurinha na lista</p>
              </div>
            ) : detected.map((d) => {
              const entry   = entries.find((e) => e.sticker_code === d.code)
              const catalog = missing.find((m) => m.sticker_code === d.code)
              const countryName = entry?.country_name ?? catalog?.country_name ?? d.code
              const isNew = d.status === 'faltante'
              const currentQty = entry?.quantity_owned ?? 0
              return (
                <div key={d.code} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-14 h-10 rounded-lg bg-ink-700 flex items-center justify-center flex-shrink-0">
                    <span className="font-mono text-xs text-ink-100">{d.code}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold text-sm text-ink-100 truncate">{countryName}</p>
                    <p className="text-ink-500 text-xs font-body">
                      {isNew ? 'Pode ser colada no álbum' : `Já tem ${currentQty} · ficará com ${currentQty + 1} (repetida)`}
                    </p>
                  </div>
                  <span
                    className="text-xs font-body px-2.5 py-1 rounded-full flex-shrink-0"
                    style={isNew
                      ? { backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ADE80' }
                      : { backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B' }
                    }
                  >
                    {isNew ? '✓ Nova' : '🔁 Repetida'}
                  </span>
                  <button
                    onClick={() => setDetected((prev) => prev.filter((x) => x.code !== d.code))}
                    className="w-7 h-7 flex items-center justify-center text-ink-600 hover:text-scarlet-400 transition-colors flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>

          {detected.length > 0 && (
            <div className="px-4 py-5">
              <button
                onClick={() => void handleSaveToEstoque()}
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
                    <PackagePlus size={20} />
                    Adicionar para o estoque ({detected.length})
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-4 py-4 border-t border-ink-700 pb-safe">
          <button
            onClick={() => setShowPreview(false)}
            className="w-full py-3 bg-ink-700 hover:bg-ink-600 rounded-xl font-heading font-bold text-ink-300 transition-colors"
          >
            Voltar ao scanner
          </button>
        </div>
      </div>
    )
  }

  // ── Scanner view ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-ink-900">
      <ScanTutorialModal />
      <div className="flex items-center gap-3 px-2 py-3 border-b border-ink-700 flex-shrink-0">
        <button
          onClick={handleClose}
          className="flex items-center gap-1 text-ink-400 hover:text-ink-200 transition-colors px-2 py-1"
          aria-label="Voltar"
        >
          <ChevronLeft size={22} />
          <span className="font-body text-sm">Voltar</span>
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Zap size={18} className="text-gold-400" />
          <h2 className="font-heading font-bold text-ink-100">Tempo Real</h2>
          {capturing && <span className="text-gold-400 text-xs font-body animate-pulse">Analisando…</span>}
        </div>
      </div>

      <div className="flex gap-2 px-4 py-2 bg-ink-800/50 flex-shrink-0 overflow-x-auto min-h-[44px] items-center">
        {detected.length === 0
          ? <span className="text-ink-500 text-xs font-body">Aponte para as figurinhas e toque em Capturar</span>
          : <>
              {detected.map((d) => {
                const isNew = d.status === 'faltante'
                return (
                  <span
                    key={d.code}
                    className="flex-shrink-0 text-xs font-mono px-2 py-1 rounded-full flex items-center gap-1"
                    style={isNew
                      ? { backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ADE80' }
                      : { backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B' }
                    }
                  >
                    {d.code}
                    <span>{isNew ? '✓' : '🔁'}</span>
                  </span>
                )
              })}
              <button
                onClick={() => setDetected([])}
                className="flex-shrink-0 text-xs font-body text-ink-600 hover:text-scarlet-400 transition-colors ml-1 px-1"
              >
                ✕
              </button>
            </>}
      </div>

      {detected.length > 0 && (
        <div className="px-4 pb-1 flex-shrink-0">
          <button
            onClick={() => setShowPreview(true)}
            className="w-full py-2.5 rounded-xl font-heading font-bold text-sm transition-all active:scale-95"
            style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            Ver prévia ({detected.length}) — {newCount} nova{newCount !== 1 ? 's' : ''}{repetidasCount > 0 ? ` · ${repetidasCount} repetida${repetidasCount !== 1 ? 's' : ''}` : ''}
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center bg-ink-950 px-4 pb-safe">
        <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-black relative" style={{ aspectRatio: '3/4' }}>
          {error ? (
            <div className="flex items-center justify-center h-full px-6">
              <p className="text-ink-400 font-body text-sm text-center">{error}</p>
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <StickerOverlay detected={detected} />
              <div className="absolute inset-0 border-2 rounded-2xl pointer-events-none transition-colors duration-300"
                style={{ borderColor: capturing ? 'rgba(245,158,11,0.5)' : 'transparent' }} />
            </>
          )}
        </div>

        {!error && (
          <div className="flex flex-col items-center gap-2 pt-3 w-full max-w-sm">
            <button
              onClick={() => void capture()}
              disabled={capturing}
              className="w-16 h-16 rounded-full bg-ink-700 hover:bg-ink-600 border-2 border-ink-500 flex items-center justify-center disabled:opacity-40 transition-all active:scale-95"
            >
              {capturing
                ? <div className="w-6 h-6 rounded-full border-2 border-ink-300/40 border-t-ink-300 animate-spin" />
                : <Zap size={22} className="text-gold-400" />}
            </button>
            {!capturing && <p className="text-ink-600 text-xs font-body">Toque para capturar e analisar</p>}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}
