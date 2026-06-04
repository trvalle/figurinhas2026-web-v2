'use client'

import type { OCRProvider } from '@/types/ocrProvider'

async function toBase64(imageData: Blob | string): Promise<string> {
  if (typeof imageData === 'string') return imageData
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(imageData)
  })
}

export const claudeHaikuProvider: OCRProvider = {
  id: 'claude-haiku',
  name: 'Claude Haiku (IA)',
  description: 'Claude Haiku 4.5 — Alta precisão para identificação de códigos.',

  async recognizeText(imageData: Blob | string): Promise<string> {
    const base64 = await toBase64(imageData)

    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64,
        mediaType: 'image/jpeg',
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
      throw new Error(error.error ?? `HTTP ${response.status}`)
    }

    const data = await response.json()
    console.debug('[Claude Haiku OCR] resultado:', data.text, `(${data.inputTokens}+${data.outputTokens} tokens)`)

    // Retornar UNKNOWN como string vazia para o pipeline tratar como não identificado
    return data.text === 'UNKNOWN' ? '' : data.text
  },
}
