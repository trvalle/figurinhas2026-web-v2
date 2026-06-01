import type { InventarioEntry } from '@/types/app.types'

export type StickerDetectionStatus = 'colada' | 'repetida' | 'faltante' | 'estoque'

export interface DetectedSticker {
  code: string
  status: StickerDetectionStatus
  boundingBox?: { x: number; y: number; width: number; height: number }
}

export interface ScanFrame {
  detected: DetectedSticker[]
  processedAt: number
}

export async function processFrame(
  canvas: HTMLCanvasElement,
  entries: InventarioEntry[],
  blob?: Blob,
): Promise<ScanFrame> {
  const imageBlob = blob ?? await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => b ? res(b) : rej(new Error('Empty canvas')), 'image/jpeg', 0.75)
  )

  const { recognizeText, extractAndValidateCodes } = await import('./ocr')
  const text = await recognizeText(imageBlob)
  const { codes } = await extractAndValidateCodes(text)

  const entryMap = new Map(entries.map((e) => [e.sticker_code, e]))

  const detected: DetectedSticker[] = codes.map((code) => {
    const entry = entryMap.get(code)
    let status: StickerDetectionStatus
    if (!entry) {
      status = 'faltante'
    } else if (entry.is_pasted) {
      status = 'colada'
    } else {
      // Tem no estoque (qty=1) ou já tem repetidas (qty>1) — escanear de novo = repetida
      status = 'repetida'
    }
    return { code, status }
  })

  return { detected, processedAt: Date.now() }
}
