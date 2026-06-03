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
      const canvas = document.createElement('canvas')
      // Normalizar para 800px de largura mantendo aspect ratio
      const targetWidth = 800
      const scale = targetWidth / img.width
      canvas.width = targetWidth
      canvas.height = img.height * scale

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Grayscale + contrast boost via pixel manipulation
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const contrastFactor = 1.8
      const intercept = 128 * (1 - contrastFactor)

      for (let i = 0; i < data.length; i += 4) {
        // Grayscale: luminância ponderada
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        // Contrast boost
        const enhanced = Math.min(255, Math.max(0, contrastFactor * gray + intercept))
        data[i] = data[i + 1] = data[i + 2] = enhanced
        // data[i + 3] = alpha, não alterar
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.95))
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
// Uma única instância por sessão do browser.
// Lazy init: só inicializa quando recognize() for chamado pela primeira vez.

let workerInstance: Worker | null = null
let workerInitPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance
  if (workerInitPromise) return workerInitPromise

  workerInitPromise = (async () => {
    const worker = await createWorker('eng', undefined, {
      logger: process.env.NODE_ENV === 'development'
        ? (m: any) => console.debug('[Tesseract]', m)
        : undefined,
    })

    await worker.setParameters({
      // Whitelist: apenas chars que aparecem em códigos de figurinha
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
      // PSM 7: imagem contém uma única linha de texto (ideal para o badge da figurinha)
      tessedit_pageseg_mode: '7' as any,
    })

    workerInstance = worker
    return worker
  })()

  return workerInitPromise
}

// ─── PROVIDER EXPORT ──────────────────────────────────────────────────────

export const tesseractProvider: OCRProvider = {
  id: 'tesseract',
  name: 'Tesseract (Offline)',
  description: 'Processamento local, sem custo. Funciona sem internet.',

  async recognizeText(imageData: Blob | string): Promise<string> {
    // 1. Pré-processar
    let processedData: string
    try {
      processedData = await preprocessForOcr(imageData)
    } catch {
      // Fallback: usar dado original se pré-processamento falhar
      processedData = typeof imageData === 'string'
        ? imageData
        : URL.createObjectURL(imageData)
    }

    // 2. OCR
    const worker = await getWorker()
    const result = await worker.recognize(processedData)
    const rawText = result.data.text.trim()

    // 3. Extrair e validar código
    const code = extractAndValidateCode(rawText.toUpperCase())

    // Retornar o código validado se encontrado, ou o texto bruto para
    // que o componente possa tratar (input manual, sugestão, etc.)
    return code ?? rawText
  },
}
