export type OCRProviderType = 'google-vision' | 'tesseract' | 'claude-haiku'

export interface OCRProvider {
  id: OCRProviderType
  name: string
  description: string

  recognizeText(imageData: Blob | string): Promise<string>
}

export const OCR_PROVIDERS: Record<OCRProviderType, { name: string; description: string }> = {
  'google-vision': {
    name: 'Google Vision',
    description: 'Google Cloud Vision API',
  },
  'tesseract': {
    name: 'Tesseract (Offline)',
    description: 'Processamento local, sem custo. Funciona sem internet.',
  },
  'claude-haiku': {
    name: 'Claude Haiku (IA)',
    description: 'Claude Haiku 4.5 — Alta precisão.',
  },
}
