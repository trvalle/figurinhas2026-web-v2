'use client'

import type { UserSticker } from '@/types/app.types'

export type StickerStatus = 'new' | 'owned' | 'duplicate' | 'pasted'

export interface RealtimeOCRResult {
  code: string
  rawCode: string
  country: string
  number: string
  confidence: number
  isValid: boolean
}

export interface DetectedSticker extends RealtimeOCRResult {
  status: StickerStatus
  albumPage?: number
}

export type ScannerReadyState = 'loading_opencv' | 'loading_ocr' | 'ready' | 'scanning' | 'error'

// ─── Hook ────────────────────────────────────────────────────────────────────
// NOTA: Este hook é legado (OpenCV + Tesseract). Para novo código, usar
// realtimeScanner.ts com processFrame() que usa Google Vision.

export function useRealtimeScanner(
  videoRef: React.RefObject<HTMLVideoElement>,
  stickers: UserSticker[],
  isActive: boolean
) {
  return {
    detected: [] as DetectedSticker[],
    readyState: 'ready' as ScannerReadyState,
  }
}
