'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { getSupabaseClient } from '@/services/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showIOSBanner, setShowIOSBanner] = useState(false)

  useEffect(() => {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const dismissed = localStorage.getItem('ios_banner_closed') === '1'
    if (isIOS && !isStandalone && !dismissed) setShowIOSBanner(true)
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email, senha }: FormData) => {
    setLoading(true)
    const supabase = getSupabaseClient()

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setLoading(false)
      toast.error('E-mail ou senha inválidos.')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    localStorage.removeItem('sticker_catalog_cache_v2')
    localStorage.removeItem('sticker_catalog_cache_v3')
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => null)
    }

    setLoading(false)
    router.push(profile ? '/tutorial' : '/cadastro')
  }

  return (
    <main className="min-h-screen bg-ink-900 flex flex-col items-center justify-center px-6 pt-safe">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-6xl">⚽</span>
          <h1 className="font-display text-4xl text-gold-400 tracking-widest uppercase">
            Figurinhas 2026
          </h1>
          <p className="text-ink-500 text-sm font-body">Organize e troque seu álbum</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="w-full flex flex-col gap-4">
          <Input
            label="E-mail"
            type="email"
            placeholder="seu@email.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Senha"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.senha?.message}
            {...register('senha')}
          />
          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
            Entrar
          </Button>
        </form>

        <p className="text-ink-500 text-sm font-body">
          Não tem conta?{' '}
          <Link href="/cadastro" className="text-gold-400 hover:text-gold-300 transition-colors">
            Criar conta
          </Link>
        </p>

        {/* iOS install banner */}
        {showIOSBanner && (
          <div
            className="w-full rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ backgroundColor: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)' }}
          >
            <span className="text-xl flex-shrink-0 leading-tight">📲</span>
            <p className="text-gold-400 text-xs font-body flex-1 leading-relaxed">
              Adicione à tela inicial: toque em{' '}
              <strong>⬆ Compartilhar</strong>{' '}
              → <strong>"Adicionar à Tela de Início"</strong>
            </p>
            <button
              onClick={() => { localStorage.setItem('ios_banner_closed', '1'); setShowIOSBanner(false) }}
              className="text-gold-500/60 hover:text-gold-400 text-xl leading-none flex-shrink-0"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
