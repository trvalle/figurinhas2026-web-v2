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

export const googleVisionProvider: OCRProvider = {
  id: 'google-vision',
  name: 'Google Vision',
  description: 'Google Cloud Vision API',

  async recognizeText(imageData: Blob | string): Promise<string> {
    const base64 = await toBase64(imageData)
    const { getSupabaseClient } = await import('../supabase')
    const supabase = getSupabaseClient()

    const { data, error } = await supabase.functions.invoke('ocr', {
      body: { image: base64 },
    })

    if (error) throw new Error(error.message)

    const payload = data as { text?: string; error?: string }
    if (payload.error) throw new Error(payload.error)

    const text = payload.text ?? ''
    console.debug('[OCR raw]', JSON.stringify(text))
    return text
  },
}
