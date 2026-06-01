'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { getSupabaseClient } from '@/services/supabase'
import { getCepCoordinates } from '@/services/geocoding'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const schemaAuth = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Mínimo de 6 caracteres'),
  confirmarSenha: z.string(),
}).refine((d) => d.senha === d.confirmarSenha, {
  message: 'Senhas não conferem',
  path: ['confirmarSenha'],
})

const schemaPerfil = z.object({
  display_name: z.string().min(2, 'Nome obrigatório'),
  cep: z.string().regex(/^\d{8}$/, 'CEP deve ter 8 números (sem hífen)'),
  whatsapp: z.string().optional(),
  notifications_enabled: z.boolean(),
})

type AuthData = z.infer<typeof schemaAuth>
type PerfilData = z.infer<typeof schemaPerfil>

export default function CadastroPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'auth' | 'perfil'>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [addressDisplay, setAddressDisplay] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    const check = async () => {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        setUserEmail(user.email ?? null)
        setPhase('perfil')
      } else {
        setPhase('auth')
      }
    }
    check()
  }, [])

  const authForm = useForm<AuthData>({ resolver: zodResolver(schemaAuth) })
  const perfilForm = useForm<PerfilData>({
    resolver: zodResolver(schemaPerfil),
    defaultValues: { notifications_enabled: true },
  })

  useEffect(() => {
    if (phase === 'perfil') {
      perfilForm.reset({
        display_name: '',
        cep: '',
        whatsapp: '',
        notifications_enabled: true,
      })
      setAddressDisplay('')
      setCoords(null)
    }
  }, [phase, perfilForm])

  const onSubmitAuth = async (data: AuthData) => {
    setLoading(true)
    const supabase = getSupabaseClient()
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.senha,
    })

    if (error || !signUpData.user) {
      toast.error(error?.message ?? 'Erro ao criar conta. Tente novamente.')
      setLoading(false)
      return
    }

    if (signUpData.session) {
      setUserId(signUpData.user.id)
      setUserEmail(data.email)
      setPhase('perfil')
    } else {
      toast.success('E-mail de confirmação enviado! Confirme e faça login para continuar.')
      router.push('/login')
    }
    setLoading(false)
  }

  const handleCepBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const cep = e.target.value.replace(/\D/g, '')
    if (cep.length !== 8) return
    setGeocoding(true)
    try {
      const result = await getCepCoordinates(cep)
      setCoords({ lat: result.lat, lng: result.lng })
      setAddressDisplay(`${result.bairro}, ${result.cidade}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar CEP.')
    } finally {
      setGeocoding(false)
    }
  }

  const onSubmitPerfil = async (data: PerfilData) => {
    if (!coords || !addressDisplay) {
      toast.error('Informe um CEP válido para localizar seu endereço.')
      return
    }
    if (!userId) return

    setLoading(true)
    const supabase = getSupabaseClient()
    const locationWKT = `POINT(${coords.lng} ${coords.lat})`

    const { error: insertError } = await supabase.from('users').insert({
      id: userId,
      display_name: data.display_name,
      address_display: addressDisplay,
      whatsapp: data.whatsapp || null,
      search_radius_km: 9999,
      notifications_enabled: data.notifications_enabled,
      is_visible: true,
      location: locationWKT,
    })

    if (insertError) {
      toast.error(insertError.message ?? 'Erro ao salvar perfil. Tente novamente.')
      setLoading(false)
      return
    }

    setLoading(false)

    try {
      await supabase.functions.invoke('notify-signup', {
        body: {
          user_id: userId,
          display_name: data.display_name,
          email: userEmail ?? '',
          whatsapp: data.whatsapp || null,
          address_display: addressDisplay,
        },
      })
    } catch {
      // silencia — cadastro já foi salvo
    }

    toast.success('Cadastro enviado! Aguarde a aprovação.')
    router.push('/tutorial')
  }

  if (phase === 'loading') {
    return (
      <main className="min-h-screen bg-ink-900 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
      </main>
    )
  }

  if (phase === 'auth') {
    return (
      <main className="min-h-screen bg-ink-900 px-6 py-8 pt-safe pb-safe overflow-y-auto">
        <div className="max-w-sm mx-auto flex flex-col gap-6">
          <div>
            <h1 className="font-display text-3xl text-gold-400 tracking-wide uppercase">Criar conta</h1>
            <p className="text-ink-500 text-sm font-body mt-1">Informe seu e-mail e senha para começar</p>
          </div>

          <form onSubmit={authForm.handleSubmit(onSubmitAuth)} className="flex flex-col gap-4">
            <Input
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              error={authForm.formState.errors.email?.message}
              {...authForm.register('email')}
            />
            <Input
              label="Senha"
              type="password"
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              error={authForm.formState.errors.senha?.message}
              {...authForm.register('senha')}
            />
            <Input
              label="Confirmar senha"
              type="password"
              placeholder="Repita a senha"
              autoComplete="new-password"
              error={authForm.formState.errors.confirmarSenha?.message}
              {...authForm.register('confirmarSenha')}
            />

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
              Criar conta
            </Button>

            <p className="text-ink-500 text-sm font-body text-center">
              Já tem conta?{' '}
              <a href="/login" className="text-gold-400 underline">Faça login</a>
            </p>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-ink-900 px-6 py-8 pt-safe pb-safe overflow-y-auto">
      <div className="max-w-sm mx-auto flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl text-gold-400 tracking-wide uppercase">Complete seu perfil</h1>
          <p className="text-ink-500 text-sm font-body mt-1">Mais um passo para finalizar o cadastro</p>
        </div>

        <form key="perfil-form" onSubmit={perfilForm.handleSubmit(onSubmitPerfil)} className="flex flex-col gap-4" autoComplete="new-password">
          <Input
            label="Nome de exibição"
            placeholder="Como quer ser chamado?"
            autoComplete="new-password"
            defaultValue=""
            error={perfilForm.formState.errors.display_name?.message}
            {...perfilForm.register('display_name')}
          />
          <Input
            label="CEP (sem hífen)"
            placeholder="01310100"
            maxLength={8}
            autoComplete="new-password"
            defaultValue=""
            error={perfilForm.formState.errors.cep?.message}
            {...perfilForm.register('cep', { onBlur: handleCepBlur })}
          />
          {geocoding && (
            <p className="text-gold-400 text-sm font-body flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
              Buscando localização…
            </p>
          )}
          {addressDisplay && (
            <div className="bg-verde-500/10 border border-verde-500/30 rounded-xl px-4 py-3">
              <p className="text-verde-400 text-sm font-body">{addressDisplay}</p>
            </div>
          )}
          <Input
            label="WhatsApp (opcional)"
            type="tel"
            placeholder="(11) 99999-9999"
            autoComplete="new-password"
            defaultValue=""
            {...perfilForm.register('whatsapp')}
          />

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-ink-100 text-sm font-body">Receber notificações de trocas</span>
            <input type="checkbox" className="w-5 h-5 accent-gold-500" {...perfilForm.register('notifications_enabled')} />
          </label>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={geocoding}
            className="w-full mt-2"
          >
            Finalizar cadastro
          </Button>
        </form>
      </div>
    </main>
  )
}
