export type OCRProviderType = 'google-vision' | 'tesseract'

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
}
