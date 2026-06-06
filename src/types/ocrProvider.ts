export type OCRProviderType = 'claude-haiku'

export interface OCRProvider {
  id: OCRProviderType
  name: string
  description: string

  recognizeText(imageData: Blob | string): Promise<string>
}

export const OCR_PROVIDERS: Record<OCRProviderType, { name: string; description: string }> = {
  'claude-haiku': {
    name: 'Claude Haiku (IA)',
    description: 'Claude Haiku 4.5 — Alta precisão.',
  },
}
