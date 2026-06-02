import type { OCRProvider, OCRProviderType } from '@/types/ocrProvider'
import { googleVisionProvider } from './googleVision'

const PROVIDERS: Record<OCRProviderType, OCRProvider> = {
  'google-vision': googleVisionProvider,
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
