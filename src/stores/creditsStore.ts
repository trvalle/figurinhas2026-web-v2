'use client'

import { create } from 'zustand'

interface CreditsStore {
  balance: number | null
  isLoading: boolean
  fetchBalance: () => Promise<void>
  decrementBalance: () => void
}

export const useCreditsStore = create<CreditsStore>((set) => ({
  balance: null,
  isLoading: false,

  fetchBalance: async () => {
    set({ isLoading: true })
    try {
      const response = await fetch('/api/credits/balance')
      if (response.ok) {
        const data = (await response.json()) as { balance?: number }
        set({ balance: data.balance ?? null })
      }
    } catch (error) {
      console.error('[Credits] Erro ao buscar saldo:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  decrementBalance: () => {
    set((state) => ({
      balance: state.balance !== null ? Math.max(0, state.balance - 1) : null,
    }))
  },
}))
