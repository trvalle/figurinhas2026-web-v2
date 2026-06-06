'use client'

import type { OCRProvider } from '@/types/ocrProvider'
import { createWorker } from 'tesseract.js'
import type { Worker } from 'tesseract.js'

// ─── PRÉ-PROCESSAMENTO ────────────────────────────────────────────────────
// Usa Canvas API nativa — zero dependências externas.
// Roda 100% no browser. NÃO usar sharp, jimp ou Node.js image libs.

async function preprocessForOcr(input: Blob | string): Promise<string> {
  // Converter input para dataURL se necessário
  const dataUrl: string = typeof input === 'string'
    ? input
    : await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(input)
      })

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      // ─────────────────────────────────────────────────────────────
      // STEP 1: Resize para 1200px (preservar detalhe do badge)
      // ─────────────────────────────────────────────────────────────
      const canvas = document.createElement('canvas')
      const targetWidth = 1200
      const scale = targetWidth / img.width
      canvas.width = targetWidth
      canvas.height = img.height * scale

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // ─────────────────────────────────────────────────────────────
      // STEP 2: Varredura por grid 4x4 — detectar região mais clara
      // ─────────────────────────────────────────────────────────────
      const gridCols = 4
      const gridRows = 4
      const cellWidth = Math.floor(canvas.width / gridCols)
      const cellHeight = Math.floor(canvas.height / gridRows)

      // Calcular brilho médio de cada célula
      const cellBrightness: Array<{ brightness: number; x: number; y: number; col: number; row: number }> = []

      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const x = col * cellWidth
          const y = row * cellHeight
          const w = col === gridCols - 1 ? canvas.width - x : cellWidth
          const h = row === gridRows - 1 ? canvas.height - y : cellHeight

          const imageData = ctx.getImageData(x, y, w, h)
          const pixels = imageData.data
          let brightness = 0

          for (let i = 0; i < pixels.length; i += 4) {
            brightness += (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2])
          }
          brightness /= (pixels.length / 4)

          cellBrightness.push({ brightness, x, y, col, row })
        }
      }

      // Ordenar por brilho descendente e pegar top 3
      const top3 = cellBrightness.sort((a, b) => b.brightness - a.brightness).slice(0, 3)

      // Verificar se alguma célula tem brilho > 180 (badge branco típico)
      const brightest = top3[0]
      let cropX: number
      let cropY: number
      let cropW: number
      let cropH: number

      if (brightest.brightness > 180) {
        // ─────────────────────────────────────────────────────────────
        // Crop expandido cobrindo top3 + 10% margem
        // ─────────────────────────────────────────────────────────────
        const minX = Math.min(...top3.map(c => c.x))
        const maxX = Math.max(...top3.map(c => c.x + cellWidth))
        const minY = Math.min(...top3.map(c => c.y))
        const maxY = Math.max(...top3.map(c => c.y + cellHeight))

        const marginX = Math.floor(cellWidth * 0.1)
        const marginY = Math.floor(cellHeight * 0.1)

        cropX = Math.max(0, minX - marginX)
        cropY = Math.max(0, minY - marginY)
        cropW = Math.min(canvas.width - cropX, maxX - minX + marginX * 2)
        cropH = Math.min(canvas.height - cropY, maxY - minY + marginY * 2)
      } else {
        // Fallback: usar terço superior da imagem inteira
        cropX = 0
        cropY = 0
        cropW = canvas.width
        cropH = Math.floor(canvas.height / 3)
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 3: Extrair crop e ampliar para 400×400 (zoom no badge)
      // ─────────────────────────────────────────────────────────────
      const cropCanvas = document.createElement('canvas')
      const zoomSize = 400
      cropCanvas.width = zoomSize
      cropCanvas.height = zoomSize

      const cropCtx = cropCanvas.getContext('2d')!
      cropCtx.drawImage(
        canvas,
        cropX, cropY, cropW, cropH,
        0, 0, zoomSize, zoomSize
      )

      // ─────────────────────────────────────────────────────────────
      // STEP 4: Grayscale + contrast mais agressivo (2.0)
      // ─────────────────────────────────────────────────────────────
      const zoomImageData = cropCtx.getImageData(0, 0, zoomSize, zoomSize)
      const zoomData = zoomImageData.data
      const contrastFactor = 2.0
      const intercept = 128 * (1 - contrastFactor)

      for (let i = 0; i < zoomData.length; i += 4) {
        // Grayscale: luminância ponderada
        const gray = 0.299 * zoomData[i] + 0.587 * zoomData[i + 1] + 0.114 * zoomData[i + 2]
        // Contrast boost
        const enhanced = Math.min(255, Math.max(0, contrastFactor * gray + intercept))
        zoomData[i] = zoomData[i + 1] = zoomData[i + 2] = enhanced
        // data[i + 3] = alpha, não alterar
      }

      cropCtx.putImageData(zoomImageData, 0, 0)
      const croppedUrl = cropCanvas.toDataURL('image/jpeg', 0.95)
      console.log('[Tesseract CROP]', croppedUrl)
      resolve(croppedUrl)
    }
    img.onerror = () => resolve(dataUrl) // fallback: usar original
    img.src = dataUrl
  })
}

// ─── VALIDAÇÃO DE CÓDIGO ──────────────────────────────────────────────────
// Regex para extrair padrão de código de figurinha do texto bruto do OCR.
// Padrão: 2-4 letras maiúsculas seguidas de 1-2 dígitos (espaço opcional).
// Exemplos válidos: "FWC12", "FWC 12", "BRA5", "BRA 05"
const CODE_REGEX = /\b([A-Z]{2,4})\s?(\d{1,2})\b/g

// Distância de Levenshtein — sem dependência externa
// Otimizado para strings curtas (máx ~8 chars)
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// Lista de códigos válidos do álbum Copa 2026
// Geração programática a partir dos prefixos conhecidos.
function buildValidCodes(): Set<string> {
  const sections: Record<string, number> = {
    FWC: 22,  // FIFA World Cup (abertura, troféu, mascote, estádios)
    BRA: 20,  // Brasil
    ARG: 20,  // Argentina
    FRA: 20,  // França
    ENG: 20,  // Inglaterra
    GER: 20,  // Alemanha
    ESP: 20,  // Espanha
    POR: 20,  // Portugal
    NED: 20,  // Holanda
    USA: 20,  // Estados Unidos
    MEX: 20,  // México
    CAN: 20,  // Canadá
    // TODO: adicionar as demais 36 seleções quando dados confirmados
  }
  const codes = new Set<string>()
  for (const [prefix, count] of Object.entries(sections)) {
    for (let i = 1; i <= count; i++) {
      codes.add(`${prefix}${i}`)
    }
  }
  return codes
}

const VALID_CODES = buildValidCodes()

function extractAndValidateCode(rawText: string): string | null {
  const normalized = rawText.toUpperCase().trim()
  const matches = [...normalized.matchAll(CODE_REGEX)]
  const candidates = matches.map(m => `${m[1]}${m[2]}`)

  // 1. Match exato
  for (const candidate of candidates) {
    if (VALID_CODES.has(candidate)) return candidate
  }

  // 2. Correção por Levenshtein (distância ≤ 1: aceitar automaticamente)
  if (candidates.length === 0) return null

  const query = candidates[0]
  const sectionPrefix = query.match(/^([A-Z]{2,4})/)?.[1]
  const searchSpace = sectionPrefix
    ? Array.from(VALID_CODES).filter(c => c.startsWith(sectionPrefix))
    : Array.from(VALID_CODES)

  let bestMatch: string | null = null
  let bestDist = Infinity

  for (const code of searchSpace) {
    const dist = levenshtein(query, code)
    if (dist < bestDist) {
      bestDist = dist
      bestMatch = code
    }
  }

  // Aceitar automaticamente apenas distância 1
  return bestDist <= 1 ? bestMatch : null
}

// ─── WORKER SINGLETON ─────────────────────────────────────────────────────
// Criado uma vez, reutilizado para todas as capturas (design recomendado v7)
// setParameters() chamado APENAS na inicialização, não a cada recognize()

let workerInstance: Worker | null = null
let workerInitPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance
  if (workerInitPromise) return workerInitPromise

  workerInitPromise = (async () => {
    try {
      const worker = await createWorker('eng', 1, {
        logger: process.env.NODE_ENV === 'development'
          ? (m: unknown) => console.debug('[Tesseract]', m)
          : undefined,
      })
      // setParameters APENAS AQUI — nunca repetir dentro do loop PSM
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
        tessedit_pageseg_mode: '7' as any,
        tessedit_ocr_engine_mode: '1',
      })
      workerInstance = worker
      return worker
    } catch (err) {
      workerInitPromise = null
      throw err
    }
  })()

  return workerInitPromise
}

// ─── MÚLTIPLOS PSM ────────────────────────────────────────────────────────
// PSM único (7 = single line) é o mais adequado para o badge da figurinha
// Múltiplos PSM via setParameters() entre recognize() calls corrompe o worker na v7

async function runWithWorker(
  processedData: string
): Promise<{ text: string; confidence: number; psm: string } | null> {
  const worker = await getWorker()

  // Tentativa com PSM padrão (já configurado na init)
  try {
    const { data } = await worker.recognize(processedData)
    console.debug(`[Tesseract PSM 7] confidence=${data.confidence} text="${data.text.trim()}"`)
    return { text: data.text.trim(), confidence: data.confidence, psm: '7' }
  } catch (err) {
    console.warn('[Tesseract] recognize() falhou:', err)
    // Se falhar, destruir singleton para forçar recriação na próxima chamada
    try {
      await workerInstance?.terminate()
    } catch {
      /* ignorar */
    }
    workerInstance = null
    workerInitPromise = null
    return null
  }
}

// ─── PROVIDER EXPORT ──────────────────────────────────────────────────────
// Arquivo deprecado — Tesseract não é mais usado
// export const tesseractProvider: OCRProvider = { ... }
