'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock } from 'lucide-react'
import { getSupabaseClient } from '@/services/supabase'

export function ApprovalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'approved' | 'pending'>('loading')

  useEffect(() => {
    const check = async () => {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus('pending'); return }

      const { data } = await supabase
        .from('users')
        .select('is_approved')
        .eq('id', user.id)
        .single()

      if (!data) {
        router.replace('/cadastro')
        return
      }

      setStatus(data.is_approved ? 'approved' : 'pending')
    }
    check()
  }, [router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-ink-900 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-gold-500/10 flex items-center justify-center">
          <Clock size={36} className="text-gold-400" />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading font-bold text-xl text-ink-100">
            Aguardando aprovação
          </h1>
          <p className="text-ink-400 font-body text-sm leading-relaxed max-w-xs">
            Sua conta está em análise. Você receberá acesso assim que o administrador aprovar seu cadastro.
          </p>
        </div>
        <div className="bg-ink-800 rounded-xl px-5 py-4 max-w-xs w-full">
          <p className="text-ink-500 text-xs font-body">
            Em caso de dúvidas, entre em contato pelo WhatsApp ou aguarde a confirmação por e-mail.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
