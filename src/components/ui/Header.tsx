'use client'

import { CreditBalance } from '@/components/credits/CreditBalance'

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-ink-800/95 backdrop-blur-md border-b border-white/7">
      <div className="flex items-center justify-between px-4 h-14">
        <h1 className="text-lg font-bold text-ink-100">Figurinhas 2026</h1>
        <CreditBalance />
      </div>
    </header>
  )
}
