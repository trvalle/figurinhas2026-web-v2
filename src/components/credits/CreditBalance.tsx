'use client'

import { useEffect } from 'react'
import { useCreditsStore } from '@/stores/creditsStore'
import { useRouter } from 'next/navigation'

export function CreditBalance() {
  const { balance, fetchBalance, isLoading } = useCreditsStore()
  const router = useRouter()

  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  if (isLoading || balance === null) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-ink-800 animate-pulse">
        <span className="text-xs text-ink-500">...</span>
      </div>
    )
  }

  return (
    <button
      onClick={() => router.push('/credits')}
      className={`flex items-center gap-1 px-2 py-1 rounded-full transition ${
        balance === 0
          ? 'bg-scarlet-500/20 border border-scarlet-500/50'
          : 'bg-ink-800 hover:bg-ink-700'
      }`}
    >
      <span className="text-sm">⚡</span>
      <span
        className={`text-xs font-bold ${
          balance === 0 ? 'text-scarlet-400' : 'text-gold-400'
        }`}
      >
        {balance}
      </span>
    </button>
  )
}
