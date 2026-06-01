'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getSupabaseClient } from '@/services/supabase'
import { useInventarioStore } from '@/stores/inventarioStore'
import { StickerOverlay } from '@/components/scanner/StickerOverlay'
import type { DetectedSticker } from '@/services/realtimeScanner'
import toast from 'react-hot-toast'

const ADMIN_EMAIL = 'trvalle@gmail.com'

interface TesseractWorker {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>
  setParameters: (params: Record<string, unknown>) => Promise<void>
  terminate: () => Promise<void>
}

declare global {
  interface Window {
    Tesseract: {
      createWorker: (lang: string, oem: number, opts?: Record<string, unknown>) => Promise<TesseractWorker>
    }
  }
}

export default function PrdScannerPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workerRef = useRef<TesseractWorker | null>(null)

  const [authChecked, setAuthChecked] = useState(false)
  const [detected, setDetected] = useState<DetectedSticker[]>([])
  const [capturing, setCapturing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tesseractReady, setTesseractReady] = useState(false)

  const entries = useInventarioStore((s) => s.entries)
  const saveScannedStickers = useInventarioStore((s) => s.saveScannedStickers)
  const entriesRef = useRef(entries)
  useEffect(() => { entriesRef.current = entries }, [entries])

  // Auth
  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      if (data.user?.email !== ADMIN_EMAIL) router.replace('/home')
      else setAuthChecked(true)
    })
  }, [router])

  // Tesseract
  useEffect(() => {
    if (!authChecked) return
    if (window.Tesseract) { setTesseractReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    script.onload = async () => {
      try {
        const worker = await window.Tesseract.createWorker('eng', 1)
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
          tessedit_pageseg_mode: '11',
        })
        workerRef.current = worker
        setTesseractReady(true)
      } catch {
        setError('Erro ao inicializar OCR')
      }
    }
    script.onerror = () => setError('Falha ao carregar OCR')
    document.head.appendChild(script)
  }, [authChecked])

  // Câmera
  useEffect(() => {
    if (!authChecked) return
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
  }, [authChecked])

  // Cleanup
  useEffect(() => () => {
    workerRef.current?.terminate()
  }, [])

  const capture = useCallback(async () => {
    if (capturing || !videoRef.current || !canvasRef.current || !workerRef.current) return
    setCapturing(true)
    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // Pré-processamento agressivo
      const ctx = canvas.getContext('2d')!
      ctx.filter = 'contrast(2) brightness(1.3)'
      ctx.drawImage(video, 0, 0)

      // OCR com Tesseract
      const { data } = await workerRef.current.recognize(canvas)
      const texto = data.text.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').trim()

      // Extrair códigos (XXX 00)
      const regex = /\b([A-Z]{2,3})\s?(\d{1,2})\b/g
      const codes: string[] = []
      let match: RegExpExecArray | null
      while ((match = regex.exec(texto)) !== null) {
        const code = `${match[1]} ${match[2]}`
        if (!codes.includes(code)) codes.push(code)
      }

      // Aplicar lógica de status (igual ao RealtimeScanner)
      const entryMap = new Map(entriesRef.current.map((e) => [e.sticker_code, e]))
      const frameDetected: DetectedSticker[] = codes.map((code) => {
        const entry = entryMap.get(code)
        let status: DetectedSticker['status']
        if (!entry) {
          status = 'faltante'
        } else if (entry.is_pasted) {
          status = 'colada'
        } else {
          status = 'repetida'
        }
        return { code, status }
      })

      setDetected((prev) => {
        const merged = new Map(prev.map((d) => [d.code, d]))
        for (const d of frameDetected) merged.set(d.code, d)
        return [...merged.values()]
      })

      if (frameDetected.length === 0) {
        toast('Nenhuma figurinha identificada. Tente outra posição.', { icon: '📷' })
      } else {
        const newCount = frameDetected.filter((d) => d.status === 'faltante').length
        if (newCount > 0) toast.success(`+${newCount} nova${newCount !== 1 ? 's' : ''} identificada${newCount !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      toast.error('Erro ao analisar. Tente novamente.')
    } finally {
      setCapturing(false)
    }
  }, [capturing])

  const handleSave = useCallback(async () => {
    if (saving || detected.length === 0) return
    setSaving(true)
    try {
      const count = await saveScannedStickers(detected.map((d) => d.code))
      toast.success(`${count} figurinha${count !== 1 ? 's' : ''} adicionada${count !== 1 ? 's' : ''}!`)
      setDetected([])
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }, [detected, saving, saveScannedStickers])

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #F59E0B', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-ink-700 bg-ink-900/50">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-semibold text-ink-400 hover:text-ink-300 transition"
        >
          <ChevronLeft size={18} />
          ← Voltar
        </button>
        <div className="text-xs font-body text-ink-500 tracking-wide">🔬 PRD SCANNER (Tesseract)</div>
        <div className="text-xs font-body text-ink-500">{tesseractReady ? '✓' : '⟳'}</div>
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
        <canvas ref={canvasRef} className="hidden" />

        {/* Overlay com status — MESMA INTERFACE DO TEMPO REAL */}
        {detected.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            <StickerOverlay detected={detected} />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="text-center">
              <p className="text-red-400 font-semibold mb-2">⚠️ Erro</p>
              <p className="text-ink-400 text-sm">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex gap-3 p-4 bg-ink-900/50 border-t border-ink-700">
        <button
          onClick={() => void capture()}
          disabled={capturing || !tesseractReady}
          className={[
            'flex-1 py-3 rounded-lg font-semibold text-sm transition',
            capturing || !tesseractReady ? 'bg-ink-700 text-ink-500 cursor-not-allowed' : 'bg-gold-500 text-ink-900 hover:bg-gold-400',
          ].join(' ')}
        >
          {!tesseractReady ? '⟳ CARREGANDO...' : capturing ? '⟳ ANALISANDO...' : '⊙ CAPTURAR'}
        </button>
        {detected.length > 0 && (
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className={[
              'flex-1 py-3 rounded-lg font-semibold text-sm transition',
              saving ? 'bg-ink-700 text-ink-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700',
            ].join(' ')}
          >
            {saving ? '⟳ SALVANDO...' : `✓ SALVAR (${detected.length})`}
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
