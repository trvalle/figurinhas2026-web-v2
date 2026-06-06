'use client'

import { useRouter } from 'next/navigation'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function InsufficientCreditsModal({ isOpen, onClose }: Props) {
  const router = useRouter()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-ink-900 border border-ink-700 rounded-2xl p-6 max-w-sm mx-4 text-center">
        <div className="text-4xl mb-3">⚡</div>
        <h2 className="text-lg font-bold text-ink-100 mb-2">
          Créditos esgotados
        </h2>
        <p className="text-sm text-ink-400 mb-6">
          Você usou todos os seus créditos. Compre mais para continuar
          identificando figurinhas.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-ink-700 text-ink-400 text-sm"
          >
            Fechar
          </button>
          <button
            onClick={() => {
              onClose()
              router.push('/credits')
            }}
            className="flex-1 py-2 rounded-lg bg-gold-500 text-ink-900 text-sm font-bold"
          >
            Comprar créditos
          </button>
        </div>
      </div>
    </div>
  )
}
