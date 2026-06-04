'use client'

import type { OCRProvider, OCRProviderType } from '@/types/ocrProvider'
import { googleVisionProvider } from './googleVision'
import { tesseractProvider } from './tesseract'
import { claudeHaikuProvider } from './claudeHaiku'

const PROVIDERS: Record<OCRProviderType, OCRProvider> = {
  'google-vision': googleVisionProvider,
  'tesseract': tesseractProvider,
  'claude-haiku': claudeHaikuProvider,
}

export function getOCRProvider(type: OCRProviderType): OCRProvider {
  const provider = PROVIDERS[type]
  if (!provider) {
    throw new Error(`OCR provider "${type}" not found`)
  }
  return provider
}

export function listOCRProviders(): OCRProvider[] {
  return Object.values(PROVIDERS)
}

export { googleVisionProvider }
