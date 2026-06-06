import { create } from 'zustand'
import type { OCRProviderType } from '@/types/ocrProvider'

interface OCRProviderStore {
  selectedProvider: OCRProviderType
  setSelectedProvider: (provider: OCRProviderType) => void
}

export const useOCRProviderStore = create<OCRProviderStore>((set) => ({
  selectedProvider: 'claude-haiku',
  setSelectedProvider: (provider) => set({ selectedProvider: provider }),
}))
