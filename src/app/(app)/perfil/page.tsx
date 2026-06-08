'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { getCepCoordinates } from '@/services/geocoding'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const schemaPerfil = z.object({
  display_name: z.string().min(2, 'Nome obrigatório'),
  cep: z.string().regex(/^\d{8}$/, 'CEP deve ter 8 números (sem hífen)'),
  whatsapp: z.string().optional(),
  notifications_enabled: z.boolean(),
})

type PerfilData = z.infer<typeof schemaPerfil>

export default function PerfilPage() {
  const router = useRouter()
  const fetchProfile = useUserStore((s) => s.fetchProfile)
  const updateProfile = useUserStore((s) => s.updateProfile)
  const profile = useUserStore((s) => s.profile)
  const loading = useUserStore((s) => s.loading)

  const [pageLoading, setPageLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [addressDisplay, setAddressDisplay] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const perfilForm = useForm<PerfilData>({
    resolver: zodResolver(schemaPerfil),
  })

  // Buscar dados do usuário ao montar
  useEffect(() => {
    const loadProfile = async () => {
      await fetchProfile()
      setPageLoading(false)
    }
    loadProfile()
  }, [fetchProfile])

  // Preencher formulário com dados do usuário
  useEffect(() => {
    if (profile) {
      perfilForm.reset({
        display_name: profile.display_name,
        cep: '',
        whatsapp: profile.whatsapp ?? '',
        notifications_enabled: profile.notifications_enabled,
      })
      setAddressDisplay(profile.address_display)
    }
  }, [profile, perfilForm])

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
    if (!profile) return

    setSaving(true)
    try {
      const updateData: Record<string, unknown> = {
        display_name: data.display_name,
        notifications_enabled: data.notifications_enabled,
      }

      // Se alterou localização, atualizar
      if (coords && addressDisplay) {
        const locationWKT = `POINT(${coords.lng} ${coords.lat})`
        updateData.location = locationWKT
        updateData.address_display = addressDisplay
      }

      // Se alterou WhatsApp
      if (data.whatsapp !== undefined) {
        updateData.whatsapp = data.whatsapp || null
      }

      await updateProfile(updateData)
      toast.success('Perfil atualizado com sucesso!')
      router.push('/home')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar perfil.')
    } finally {
      setSaving(false)
    }
  }

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-ink-900 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-ink-900 px-6 py-8 pt-safe pb-safe flex items-center justify-center">
        <div className="text-center">
          <p className="text-ink-400 mb-4">Erro ao carregar perfil.</p>
          <Button onClick={() => router.push('/home')} variant="primary" size="lg">
            Voltar para home
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-ink-900 px-6 py-8 pt-safe pb-safe overflow-y-auto">
      <div className="max-w-sm mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/6 flex items-center justify-center text-ink-400 hover:bg-white/10 transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-display text-3xl text-gold-400 tracking-wide uppercase">Editar perfil</h1>
            <p className="text-ink-500 text-sm font-body mt-1">Atualize suas informações</p>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={perfilForm.handleSubmit(onSubmitPerfil)} className="flex flex-col gap-4">
          <Input
            label="Nome de exibição"
            placeholder="Como quer ser chamado?"
            error={perfilForm.formState.errors.display_name?.message}
            {...perfilForm.register('display_name')}
          />

          {/* CPF - Somente leitura */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink-300">CPF</label>
            <div className="w-full px-4 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-400 flex items-center gap-2">
              <span>CPF cadastrado</span>
              <span className="text-verde-400">✓</span>
            </div>
            <p className="text-xs text-ink-600">
              CPF não pode ser alterado após o cadastro
            </p>
          </div>

          <Input
            label="CEP (sem hífen)"
            placeholder="01310100"
            maxLength={8}
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
            loading={saving || loading}
            disabled={geocoding}
            className="w-full mt-2"
          >
            Salvar alterações
          </Button>
        </form>
      </div>
    </main>
  )
}
