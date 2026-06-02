'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { loadOpenCV, isOpenCVReady } from '@/services/opencvLoader'
import { extractROIs, preprocessForOCR } from '@/services/opencvPipeline'
import { initOCR, recognizeBatch } from '@/services/ocrService'
import type { RealtimeOCRResult } from '@/services/ocrService'
import type { UserSticker } from '@/types/app.types'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type StickerStatus = 'new' | 'owned' | 'duplicate' | 'pasted'

export interface DetectedSticker extends RealtimeOCRResult {
  status: StickerStatus
  albumPage?: number
}

export type ScannerReadyState = 'loading_opencv' | 'loading_ocr' | 'ready' | 'scanning' | 'error'

export interface RealtimeScannerState {
  detected: DetectedSticker[]
  readyState: ScannerReadyState
  errorMessage: string | null
  framesProcessed: number
  lastScanDurationMs: number
}

// ─── Configuração ────────────────────────────────────────────────────────────

// Intervalo entre scans em ms (aumentar se dispositivo for lento)
const SCAN_INTERVAL_MS = 1200

// Confiança mínima do Tesseract para aceitar um resultado (0-100)
// Aumentado para 70 para filtrar mais falsos positivos
const MIN_CONFIDENCE = 70

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRealtimeScanner(
  videoRef: React.RefObject<HTMLVideoElement>,
  stickers: UserSticker[],
  isActive: boolean
) {
  const [state, setState] = useState<RealtimeScannerState>({
    detected: [],
    readyState: 'loading_opencv',
    errorMessage: null,
    framesProcessed: 0,
    lastScanDurationMs: 0,
  })

  // Canvas oculto reutilizado a cada frame (evita criar/destruir DOM)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isProcessingRef = useRef(false)

  // ── Inicialização assíncrona ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // 1. Carregar OpenCV.js
        setState(s => ({ ...s, readyState: 'loading_opencv' }))
        await loadOpenCV()
        if (cancelled) return

        // 2. Inicializar Tesseract worker
        setState(s => ({ ...s, readyState: 'loading_ocr' }))
        await initOCR()
        if (cancelled) return

        // 3. Criar canvas reutilizável
        canvasRef.current = document.createElement('canvas')

        setState(s => ({ ...s, readyState: 'ready' }))
      } catch (err) {
        if (cancelled) return
        setState(s => ({
          ...s,
          readyState: 'error',
          errorMessage: err instanceof Error ? err.message : 'Erro desconhecido na inicialização',
        }))
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  // ── Processamento de frame ────────────────────────────────────────────────

  const processFrame = useCallback(async () => {
    // Guards: não processar se não estiver pronto ou já processando
    if (isProcessingRef.current) return
    if (!videoRef.current || !canvasRef.current) return
    if (!isOpenCVReady()) return

    const video = videoRef.current
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    isProcessingRef.current = true
    const startTime = performance.now()

    setState(s => ({ ...s, readyState: 'scanning' }))

    try {
      // 1. Capturar frame atual do vídeo no canvas
      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0)

      // 2. OpenCV: detectar e recortar ROIs (retângulos de código)
      const crops = extractROIs(canvas)

      let ocrResults: RealtimeOCRResult[] = []

      if (crops.length > 0) {
        // 3. Pré-processar cada crop para melhor qualidade OCR
        const processedCrops = crops.map(crop => ({
          ...crop,
          canvas: preprocessForOCR(crop.canvas),
        }))

        // 4. Tesseract: OCR em batch nos crops
        ocrResults = await recognizeBatch(processedCrops)
      }

      // 5. Fallback: OpenCV não encontrou ROIs com as proporções esperadas.
      //    Tenta OCR direto no frame completo redimensionado.
      //    Menos preciso, mas garante que nenhuma figurinha seja perdida
      //    por variação de ângulo ou contraste incomum.
      if (crops.length === 0) {
        // Criar canvas redimensionado para 1280px (mesma escala do OpenCV)
        const fallbackCanvas = document.createElement('canvas')
        const scale = 1280 / canvas.width
        fallbackCanvas.width = 1280
        fallbackCanvas.height = Math.round(canvas.height * scale)

        const fallbackCtx = fallbackCanvas.getContext('2d')
        if (fallbackCtx) {
          // Desenhar frame redimensionado
          fallbackCtx.drawImage(canvas, 0, 0, fallbackCanvas.width, fallbackCanvas.height)

          // Aplicar pré-processamento (3x escala + sem smoothing)
          const processedFallback = preprocessForOCR(fallbackCanvas)

          ocrResults = await recognizeBatch([
            { canvas: processedFallback, roi: { x: 0, y: 0, width: fallbackCanvas.width, height: fallbackCanvas.height } },
          ])
        }
      }

      // 6. Filtrar por confiança mínima
      const confident = ocrResults.filter(r => r.confidence >= MIN_CONFIDENCE && r.isValid)

      // 7. Enriquecer com status do álbum do usuário
      const detected: DetectedSticker[] = confident.map(result => ({
        ...result,
        status: getStickerStatus(result.code, stickers),
        albumPage: getCatalogPage(result.code),
      }))

      const duration = performance.now() - startTime

      setState(s => ({
        ...s,
        detected,
        readyState: 'ready',
        framesProcessed: s.framesProcessed + 1,
        lastScanDurationMs: Math.round(duration),
      }))
    } catch (error) {
      console.warn('[useRealtimeScanner] Erro ao processar frame:', error)
      setState(s => ({ ...s, readyState: 'ready' }))
    } finally {
      isProcessingRef.current = false
    }
  }, [videoRef, stickers])

  // ── Controle do intervalo ─────────────────────────────────────────────────

  useEffect(() => {
    if (
      !isActive ||
      state.readyState === 'error' ||
      state.readyState === 'loading_opencv' ||
      state.readyState === 'loading_ocr'
    ) {
      // Parar intervalo se scanner está inativo ou não pronto
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    if (state.readyState === 'ready' || state.readyState === 'scanning') {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(processFrame, SCAN_INTERVAL_MS)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isActive, state.readyState, processFrame])

  return state
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStickerStatus(code: string, stickers: UserSticker[]): StickerStatus {
  const sticker = stickers.find(s => s.sticker_code === code)
  if (!sticker) return 'new'
  if (sticker.is_pasted) return 'pasted'
  if (sticker.quantity_owned > 1) return 'duplicate'
  return 'owned'
}

function getCatalogPage(code: string): number | undefined {
  // Busca no cache do catálogo (localStorage) — mesma lógica do ocrService existente
  try {
    const raw = localStorage.getItem('sticker_catalog_cache')
    if (!raw) return undefined
    const { data } = JSON.parse(raw) as { data: Array<{ sticker_code: string; album_page: number }> }
    return data.find(e => e.sticker_code === code)?.album_page
  } catch {
    return undefined
  }
}
