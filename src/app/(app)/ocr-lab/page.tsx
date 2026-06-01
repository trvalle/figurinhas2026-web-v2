'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/services/supabase'

const ADMIN_EMAIL = 'trvalle@gmail.com'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Figurinha {
  code: string
  pais: string
  numero: string
  status: 'valida' | 'revisar' | 'invalida'
  countryName?: string
}
interface LogEntry { msg: string; tipo: 'info' | 'ok' | 'warn' | 'error'; ts: string }
type Status = 'idle' | 'loading' | 'scanning' | 'result' | 'error'

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

// ── Extração com validação por catálogo ──────────────────────────────────────

function extrairFigurinhas(
  texto: string,
  codeMap: Map<string, string>,
  countryCodes: Set<string>,
): Figurinha[] {
  const clean = texto.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const regex = /\b([A-Z]{2,3})\s?(\d{1,2})\b/g
  const resultados: Figurinha[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(clean)) !== null) {
    const pais   = match[1]!
    const numero = match[2]!
    const code   = `${pais} ${numero}`
    if (resultados.find(r => r.code === code)) continue
    let status: Figurinha['status']
    let countryName: string | undefined
    if (codeMap.size === 0) {
      status = 'revisar'
    } else if (codeMap.has(code)) {
      status = 'valida'; countryName = codeMap.get(code)
    } else if (countryCodes.has(pais)) {
      status = 'revisar'
    } else {
      status = 'invalida'
    }
    resultados.push({ code, pais, numero, status, countryName })
  }
  return resultados
}

// ── Pré-processamento agressivo para melhor OCR ──────────────────────────────────────
//
// Pipeline: scale 4x → contrast+brightness forte → sharpening → Otsu → binarização

function preprocessForOCR(source: HTMLVideoElement): HTMLCanvasElement {
  const vw = source.videoWidth
  const vh = source.videoHeight

  // Scale 4x — texto bem grande para Tesseract
  const SCALE = 4
  const out = document.createElement('canvas')
  out.width  = vw * SCALE
  out.height = vh * SCALE
  const ctx = out.getContext('2d')!

  ctx.imageSmoothingEnabled  = true
  ctx.imageSmoothingQuality  = 'high'
  ctx.drawImage(source, 0, 0, vw, vh, 0, 0, out.width, out.height)

  // Pegar dados da imagem escalada
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d   = img.data
  const w   = out.width
  const h   = out.height
  const total = w * h

  // 1. Contrast + Brightness agressivo — realça diferenças
  const contrast = 2.0  // era 1.4
  const brightness = 1.3  // era 1.1
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.min(255, Math.max(0, (d[i]! - 128) * contrast + 128) * brightness)
    d[i + 1] = Math.min(255, Math.max(0, (d[i + 1]! - 128) * contrast + 128) * brightness)
    d[i + 2] = Math.min(255, Math.max(0, (d[i + 2]! - 128) * contrast + 128) * brightness)
  }
  ctx.putImageData(img, 0, 0)

  // 2. Sharpening kernel — realça bordas das letras
  const sharpened = ctx.getImageData(0, 0, w, h)
  const sd = sharpened.data
  const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1]  // sharpening
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4
      let r = 0, g = 0, b = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pidx = ((y + ky) * w + (x + kx)) * 4
          const k = kernel[(ky + 1) * 3 + (kx + 1)]!
          r += d[pidx]! * k
          g += d[pidx + 1]! * k
          b += d[pidx + 2]! * k
        }
      }
      sd[idx]     = Math.min(255, Math.max(0, r))
      sd[idx + 1] = Math.min(255, Math.max(0, g))
      sd[idx + 2] = Math.min(255, Math.max(0, b))
    }
  }
  ctx.putImageData(sharpened, 0, 0)

  // 3. Converter para grayscale para Otsu
  const gray = ctx.getImageData(0, 0, w, h)
  const gd = gray.data
  for (let i = 0; i < gd.length; i += 4) {
    const lum = Math.round(0.299 * gd[i]! + 0.587 * gd[i + 1]! + 0.114 * gd[i + 2]!)
    gd[i] = gd[i + 1] = gd[i + 2] = lum
  }

  // 4. Otsu threshold — encontra limiar ótimo
  const hist = new Array(256).fill(0)
  for (let i = 0; i < gd.length; i += 4) {
    hist[gd[i]!]++
  }

  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]!
  let sumB = 0, wB = 0, maxVar = 0, threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]!
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const v  = wB * wF * (mB - mF) ** 2
    if (v > maxVar) { maxVar = v; threshold = t }
  }

  // 5. Binarização final — preto/branco absoluto
  for (let i = 0; i < gd.length; i += 4) {
    const bin = gd[i]! < threshold ? 0 : 255
    gd[i] = gd[i + 1] = gd[i + 2] = bin
  }
  ctx.putImageData(gray, 0, 0)

  return out
}

// ── Constantes visuais ───────────────────────────────────────────────────────

const STATUS_COLOR: Record<Status, string> = {
  idle: '#6B7280', loading: '#F59E0B', scanning: '#3B82F6', result: '#10B981', error: '#EF4444',
}
const STATUS_LABEL: Record<Status, string> = {
  idle: 'Aguardando', loading: 'Carregando...', scanning: 'Analisando...', result: 'Concluído', error: 'Erro',
}
const FIG_COLOR = { valida: '#10B981', revisar: '#F59E0B', invalida: '#EF4444' }
const FIG_LABEL = { valida: 'VÁLIDA', revisar: 'REVISAR', invalida: 'INVÁLIDA' }

// ── Componente principal ──────────────────────────────────────────────────────

export default function OcrLabPage() {
  const router     = useRouter()
  const videoRef   = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)   // prévia do pré-processamento
  const streamRef  = useRef<MediaStream | null>(null)
  const workerRef  = useRef<TesseractWorker | null>(null)

  const [status,         setStatus]         = useState<Status>('idle')
  const [tesseractReady, setTesseractReady] = useState(false)
  const [catalogReady,   setCatalogReady]   = useState(false)
  const [cameraAtiva,    setCameraAtiva]    = useState(false)
  const [textoOCR,       setTextoOCR]       = useState('')
  const [textoRaw,       setTextoRaw]       = useState('')
  const [figurinhas,     setFigurinhas]     = useState<Figurinha[]>([])
  const [confianca,      setConfianca]      = useState(0)
  const [log,            setLog]            = useState<LogEntry[]>([])
  const [frameCount,     setFrameCount]     = useState(0)
  const [authChecked,    setAuthChecked]    = useState(false)
  const [ocrThreshold,   setOcrThreshold]   = useState(0)

  const codeMapRef    = useRef<Map<string, string>>(new Map())
  const countrySetRef = useRef<Set<string>>(new Set())

  const addLog = useCallback((msg: string, tipo: LogEntry['tipo'] = 'info') => {
    const ts = new Date().toLocaleTimeString('pt-BR')
    setLog(prev => [...prev.slice(-8), { msg, tipo, ts }])
  }, [])

  // Auth
  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      if (data.user?.email !== ADMIN_EMAIL) router.replace('/home')
      else setAuthChecked(true)
    })
  }, [router])

  // Catálogo
  useEffect(() => {
    if (!authChecked) return
    addLog('Carregando catálogo...', 'info')
    getSupabaseClient()
      .from('sticker_catalog')
      .select('sticker_code, country_code, country_name')
      .then(({ data, error }) => {
        if (error || !data) { addLog('Erro ao carregar catálogo', 'error'); return }
        const map = new Map<string, string>()
        const codes = new Set<string>()
        data.forEach(row => {
          map.set(row.sticker_code as string, row.country_name as string)
          codes.add(row.country_code as string)
        })
        codeMapRef.current    = map
        countrySetRef.current = codes
        setCatalogReady(true)
        addLog(`Catálogo: ${map.size} figurinhas · ${codes.size} seleções`, 'ok')
      })
  }, [authChecked, addLog])

  // Tesseract via CDN
  useEffect(() => {
    if (!authChecked) return
    if (window.Tesseract) { setTesseractReady(true); addLog('Tesseract pronto', 'ok'); return }
    setStatus('loading')
    addLog('Carregando Tesseract.js...', 'info')
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    script.onload = async () => {
      try {
        const worker = await window.Tesseract.createWorker('eng', 1, {
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') addLog(`OCR: ${Math.round(m.progress * 100)}%`, 'info')
          },
        })
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
          // PSM 11: texto esparso — melhor para poucos caracteres espalhados
          tessedit_pageseg_mode: '11',
        })
        workerRef.current = worker
        setTesseractReady(true)
        setStatus('idle')
        addLog('Tesseract pronto ✓ (PSM 11, LSTM)', 'ok')
      } catch {
        setStatus('error'); addLog('Erro ao inicializar Tesseract', 'error')
      }
    }
    script.onerror = () => { setStatus('error'); addLog('Falha ao carregar Tesseract.js', 'error') }
    document.head.appendChild(script)
  }, [authChecked, addLog])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    workerRef.current?.terminate()
  }, [])

  const iniciarCamera = async () => {
    try {
      addLog('Acessando câmera...', 'info')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setCameraAtiva(true)
      setStatus('idle')
      addLog('Câmera ativa ✓ (resolução máxima)', 'ok')
    } catch (e) {
      addLog(`Erro: ${e instanceof Error ? e.message : 'desconhecido'}`, 'error')
      setStatus('error')
    }
  }

  const pararCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraAtiva(false)
    setStatus('idle')
    setFigurinhas([])
    setTextoOCR('')
    setTextoRaw('')
    if (previewRef.current) {
      const ctx = previewRef.current.getContext('2d')!
      ctx.clearRect(0, 0, previewRef.current.width, previewRef.current.height)
    }
    addLog('Câmera desativada', 'info')
  }

  const capturarEAnalisar = useCallback(async () => {
    if (!workerRef.current || !videoRef.current) return
    if (status === 'scanning') return
    setStatus('scanning')
    setFrameCount(prev => prev + 1)

    // Pipeline de pré-processamento avançado
    const processed = preprocessForOCR(videoRef.current)

    // Mostrar prévia do que o OCR vai analisar
    if (previewRef.current) {
      previewRef.current.width  = processed.width
      previewRef.current.height = processed.height
      previewRef.current.getContext('2d')!.drawImage(processed, 0, 0)
    }

    // Estimar threshold aplicado (para log)
    try {
      const pCtx = processed.getContext('2d')!
      const sample = pCtx.getImageData(0, 0, 10, 10).data
      setOcrThreshold(sample[0] ?? 0)
    } catch { /* silencioso */ }

    try {
      const { data } = await workerRef.current.recognize(processed)
      setTextoRaw(data.text)
      const textoLimpo = data.text.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').trim()
      const conf = Math.round(data.confidence)
      setTextoOCR(textoLimpo)
      setConfianca(conf)

      const encontradas = extrairFigurinhas(textoLimpo, codeMapRef.current, countrySetRef.current)
      const validas = encontradas.filter(f => f.status === 'valida').length
      const revisar = encontradas.filter(f => f.status === 'revisar').length

      if (encontradas.length > 0) {
        // Modo acumulativo — adiciona novas figurinhas ao invés de substituir
        setFigurinhas(prev => {
          const codes = new Set(prev.map(f => f.code))
          const novas = encontradas.filter(f => !codes.has(f.code))
          return [...prev, ...novas]
        })
        addLog(`${encontradas.length} nesta foto: ${validas}✓ ${revisar}? — conf. ${conf}%`, 'ok')
      } else {
        addLog(`Nenhum código nesta foto — conf. ${conf}% — tente enquadrar melhor`, 'warn')
      }
      setStatus('result')
    } catch (e) {
      addLog(`Erro OCR: ${e instanceof Error ? e.message : '?'}`, 'error')
      setStatus('idle')
    }
  }, [status, addLog])

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #F59E0B', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const sc    = STATUS_COLOR[status]
  const ready = tesseractReady && catalogReady

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', color: '#E2E8F0', fontFamily: "'Courier New', monospace", paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#16213e)', borderBottom: '1px solid #2D3748', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10, color: '#4A9EFF', letterSpacing: 3, marginBottom: 2 }}>ADMIN / OCR LAB v2</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#FFF', letterSpacing: 1 }}>Scanner Tesseract</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1E2433', borderRadius: 20, padding: '5px 14px', border: `1px solid ${sc}33` }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc, boxShadow: `0 0 6px ${sc}`, animation: status === 'scanning' ? 'pulse 1s infinite' : 'none' }} />
            <span style={{ fontSize: 10, color: sc, letterSpacing: 1 }}>{STATUS_LABEL[status]}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 9, color: tesseractReady ? '#10B981' : '#F59E0B', letterSpacing: 1 }}>{tesseractReady ? '● OCR' : '○ OCR'}</span>
            <span style={{ fontSize: 9, color: catalogReady ? '#10B981' : '#F59E0B', letterSpacing: 1 }}>{catalogReady ? `● BD(${codeMapRef.current.size})` : '○ BD'}</span>
            {confianca > 0 && <span style={{ fontSize: 9, color: confianca > 70 ? '#10B981' : '#F59E0B', letterSpacing: 1 }}>CONF.{confianca}%</span>}
          </div>
        </div>
      </div>

      {/* Câmera */}
      <div style={{ position: 'relative', background: '#050508', aspectRatio: '4/3', overflow: 'hidden' }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraAtiva ? 'block' : 'none' }} muted playsInline />

        {!cameraAtiva && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontSize: 48, opacity: 0.15 }}>📷</div>
            <div style={{ fontSize: 11, color: '#374151', letterSpacing: 3 }}>CÂMERA INATIVA</div>
          </div>
        )}

        {cameraAtiva && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {/* ROI box — mostra a área que será processada */}
            <div style={{ position: 'absolute', top: '28%', left: '10%', width: '80%', height: '44%', border: '1.5px solid rgba(74,158,255,0.5)', borderRadius: 4 }}>
              <div style={{ position: 'absolute', top: -2, left: -2, width: 14, height: 14, borderTop: '2px solid #4A9EFF', borderLeft: '2px solid #4A9EFF' }} />
              <div style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderTop: '2px solid #4A9EFF', borderRight: '2px solid #4A9EFF' }} />
              <div style={{ position: 'absolute', bottom: -2, left: -2, width: 14, height: 14, borderBottom: '2px solid #4A9EFF', borderLeft: '2px solid #4A9EFF' }} />
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderBottom: '2px solid #4A9EFF', borderRight: '2px solid #4A9EFF' }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 9, color: 'rgba(74,158,255,0.6)', letterSpacing: 2, whiteSpace: 'nowrap' }}>
                ENQUADRE AS FIGURINHAS
              </div>
            </div>
            {status === 'scanning' && (
              <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,#4A9EFF,transparent)', animation: 'scanline 1.5s linear infinite' }} />
            )}
            <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 9, color: 'rgba(74,158,255,0.5)', letterSpacing: 1 }}>
              FRAME #{frameCount.toString().padStart(4, '0')}
            </div>
          </div>
        )}
      </div>

      {/* Controles */}
      <div style={{ padding: '12px 16px', background: '#0D0D17', borderBottom: '1px solid #1E2433', display: 'flex', gap: 10 }}>
        {!cameraAtiva ? (
          <button
            onClick={iniciarCamera}
            disabled={!ready}
            style={{ flex: 1, padding: 12, background: ready ? 'linear-gradient(135deg,#1D4ED8,#3B82F6)' : '#1E2433', color: ready ? '#FFF' : '#4B5563', border: 'none', borderRadius: 8, fontSize: 12, letterSpacing: 2, cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
          >
            {!tesseractReady ? '⟳ CARREGANDO OCR...' : !catalogReady ? '⟳ CARREGANDO BD...' : '▶ INICIAR CÂMERA'}
          </button>
        ) : (
          <>
            <button
              onClick={() => void capturarEAnalisar()}
              disabled={status === 'scanning'}
              style={{ flex: 2, padding: 12, background: status === 'scanning' ? '#1E2433' : 'linear-gradient(135deg,#065F46,#10B981)', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 12, letterSpacing: 2, cursor: status === 'scanning' ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
            >
              {status === 'scanning' ? '⟳ ANALISANDO...' : '⊙ CAPTURAR'}
            </button>
            <button
              onClick={pararCamera}
              style={{ flex: 1, padding: 12, background: '#1E2433', color: '#EF4444', border: '1px solid #EF444433', borderRadius: 8, fontSize: 12, letterSpacing: 2, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ■ PARAR
            </button>
          </>
        )}
      </div>

      {/* Prévia do pré-processamento */}
      <div style={{ padding: '12px 16px 4px' }}>
        <div style={{ fontSize: 10, color: '#4B5563', letterSpacing: 3, marginBottom: 6 }}>
          IMAGEM PRÉ-PROCESSADA (OCR analisa isso)
          {ocrThreshold > 0 && <span style={{ color: '#4A9EFF', marginLeft: 8 }}>· OTSU THRESHOLD APLICADO</span>}
        </div>
        <canvas
          ref={previewRef}
          style={{ width: '100%', maxHeight: 120, objectFit: 'contain', border: '1px solid #1E2433', borderRadius: 6, background: '#050508', display: 'block' }}
        />
        <div style={{ fontSize: 9, color: '#374151', marginTop: 4, letterSpacing: 0.5 }}>
          Full frame · Scale 4× · Contrast 2.0 · Sharpening · Otsu · PSM 11
        </div>
      </div>

      {/* Figurinhas detectadas */}
      <div style={{ padding: '12px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#4B5563', letterSpacing: 3 }}>
            FIGURINHAS ACUMULADAS ({figurinhas.length})
          </div>
          {figurinhas.length > 0 && (
            <button
              onClick={() => { setFigurinhas([]); addLog('Lista limpa', 'info') }}
              style={{ fontSize: 9, padding: '4px 10px', background: '#EF444422', color: '#EF4444', border: '1px solid #EF444433', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1 }}
            >
              LIMPAR
            </button>
          )}
        </div>
        {figurinhas.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', border: '1px dashed #1E2433', borderRadius: 8, color: '#374151', fontSize: 11, letterSpacing: 1 }}>
            Nenhuma figurinha detectada ainda
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {figurinhas.map((f, i) => {
              const c = FIG_COLOR[f.status]
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: `${c}11`, border: `1px solid ${c}33`, borderRadius: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18, fontWeight: 'bold', color: c, letterSpacing: 1 }}>{f.pais}</span>
                      <span style={{ fontSize: 22, fontWeight: 'bold', color: '#E2E8F0' }}>#{f.numero}</span>
                    </div>
                    {f.countryName && <span style={{ fontSize: 10, color: '#6B7280' }}>{f.countryName}</span>}
                  </div>
                  <div style={{ fontSize: 10, letterSpacing: 1, color: c, padding: '3px 8px', border: `1px solid ${c}33`, borderRadius: 4 }}>
                    {FIG_LABEL[f.status]}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Texto processado (limpeza) */}
      <div style={{ padding: '8px 16px' }}>
        <div style={{ fontSize: 10, color: '#4B5563', letterSpacing: 3, marginBottom: 6 }}>TEXTO PROCESSADO (letras + números)</div>
        <div style={{ padding: '8px 12px', background: '#050508', border: '1px solid #1E2433', borderRadius: 6, fontSize: 11, color: '#6B7280', minHeight: 40, wordBreak: 'break-all', fontFamily: 'inherit' }}>
          {textoOCR || '—'}
        </div>
      </div>

      {/* Texto bruto da imagem */}
      <div style={{ padding: '8px 16px' }}>
        <div style={{ fontSize: 10, color: '#4B5563', letterSpacing: 3, marginBottom: 6 }}>TEXTO BRUTO (tudo que o OCR viu)</div>
        <div style={{ padding: '8px 12px', background: '#050508', border: '1px solid #1E2433', borderRadius: 6, fontSize: 11, color: '#6B7280', minHeight: 40, wordBreak: 'break-all', fontFamily: 'inherit' }}>
          {textoRaw || '—'}
        </div>
      </div>

      {/* Log */}
      <div style={{ padding: '8px 16px' }}>
        <div style={{ fontSize: 10, color: '#4B5563', letterSpacing: 3, marginBottom: 6 }}>LOG</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[...log].reverse().map((l, i) => (
            <div key={i} style={{ fontSize: 10, color: l.tipo === 'ok' ? '#10B981' : l.tipo === 'error' ? '#EF4444' : l.tipo === 'warn' ? '#F59E0B' : '#6B7280', display: 'flex', gap: 8 }}>
              <span style={{ opacity: 0.35, flexShrink: 0 }}>{l.ts}</span>
              <span>{l.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div style={{ padding: '6px 16px 4px', fontSize: 9, color: '#374151', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span><span style={{ color: '#10B981' }}>●</span> VÁLIDA — código exato no catálogo</span>
        <span><span style={{ color: '#F59E0B' }}>●</span> REVISAR — país existe, número não</span>
        <span><span style={{ color: '#EF4444' }}>●</span> INVÁLIDA — país desconhecido</span>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes scanline { 0%{top:25%} 100%{top:75%} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
