'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CREDIT_PACKAGES } from '@/lib/credits/packages'
import { useCreditsStore } from '@/stores/creditsStore'

export default function CreditsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { balance, fetchBalance } = useCreditsStore()
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchBalance()
    const status = searchParams.get('status')
    if (status === 'success')
      setMessage('✅ Pagamento aprovado! Créditos adicionados.')
    if (status === 'failure')
      setMessage('❌ Pagamento não aprovado. Tente novamente.')
    if (status === 'pending') setMessage('⏳ Pagamento em processamento.')
  }, [fetchBalance, searchParams])

  const handleBuy = async (packId: string) => {
    setLoading(packId)
    try {
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      })

      if (!response.ok) throw new Error('Erro ao criar pagamento')

      const data = (await response.json()) as { initPoint?: string }
      if (data.initPoint) {
        window.location.href = data.initPoint
      } else {
        throw new Error('initPoint não retornado')
      }
    } catch (error) {
      console.error('[Credits] Erro:', error)
      setMessage('❌ Erro ao processar. Tente novamente.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-ink-900 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-ink-100">Créditos</h1>
          <p className="text-ink-400 text-sm mt-1">
            Saldo atual:{' '}
            <span className="text-gold-400 font-bold">
              {balance ?? '...'} créditos
            </span>
          </p>
          <p className="text-ink-500 text-xs mt-1">
            1 crédito = 1 foto identificada
          </p>
        </div>

        {/* Mensagem de status */}
        {message && (
          <div className="mb-4 p-3 rounded-lg bg-ink-800 text-center text-sm text-ink-300">
            {message}
          </div>
        )}

        {/* Pacotes */}
        <div className="flex flex-col gap-3">
          {CREDIT_PACKAGES.map((pack) => (
            <div
              key={pack.id}
              className={`rounded-xl p-4 border ${
                pack.highlight
                  ? 'border-gold-500 bg-gold-500/10'
                  : 'border-ink-700 bg-ink-800'
              }`}
            >
              {pack.highlight && (
                <div className="text-xs text-gold-400 font-bold mb-2">
                  ⭐ MAIS POPULAR
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-ink-100 font-bold">{pack.name}</div>
                  <div className="text-ink-400 text-sm">⚡ {pack.credits} créditos</div>
                </div>
                <button
                  onClick={() => handleBuy(pack.id)}
                  disabled={loading === pack.id}
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${
                    pack.highlight
                      ? 'bg-gold-500 text-ink-900'
                      : 'bg-ink-700 text-ink-100'
                  } disabled:opacity-50`}
                >
                  {loading === pack.id ? '...' : pack.priceDisplay}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="mt-6 p-3 rounded-lg bg-ink-800 text-xs text-ink-500 text-center">
          Pagamentos processados pelo Mercado Pago.
          <br />
          PIX e cartão de crédito aceitos.
          <br />
          Créditos adicionados imediatamente após aprovação.
        </div>
      </div>
    </div>
  )
}
