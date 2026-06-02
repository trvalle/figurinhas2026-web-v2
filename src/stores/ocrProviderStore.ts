import { create } from 'zustand'
import type { OCRProviderType } from '@/types/ocrProvider'

interface OCRProviderStore {
  selectedProvider: OCRProviderType
  setSelectedProvider: (provider: OCRProviderType) => void
}

export const useOCRProviderStore = create<OCRProviderStore>((set) => ({
  selectedProvider: 'google-vision',
  setSelectedProvider: (provider) => set({ selectedProvider: provider }),
}))
