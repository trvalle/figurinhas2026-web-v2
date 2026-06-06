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

// Arquivo deprecado — Google Vision não é mais usado
// export const googleVisionProvider: OCRProvider = {
//   id: 'google-vision',
//   ...
// }
