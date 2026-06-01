'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, Users, RefreshCw, BarChart2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSupabaseClient } from '@/services/supabase'

const ADMIN_EMAIL = 'trvalle@gmail.com'

type Tab = 'aprovacao' | 'consulta'

type PendingUser = {
  id: string
  display_name: string
  address_display: string
  whatsapp: string | null
  created_at: string
  email: string
}

type UserStat = {
  id: string
  display_name: string
  coladas: number
  repetidas: number
}

// ── Aba Aprovação ────────────────────────────────────────────────────────────

function TabAprovacao() {
  const [users, setUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.rpc('get_pending_users')
    if (error) toast.error('Erro ao carregar: ' + error.message)
    else setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const approve = async (userId: string, name: string) => {
    setApproving(userId)
    const supabase = getSupabaseClient()
    const { error } = await supabase.rpc('approve_user', { target_user_id: userId })
    if (error) toast.error('Erro ao aprovar: ' + error.message)
    else { toast.success(`${name} aprovado!`); setUsers(prev => prev.filter(u => u.id !== userId)) }
    setApproving(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return users.length === 0 ? (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <Clock size={40} className="text-ink-700" />
      <p className="text-ink-500 font-body text-sm">Nenhum cadastro aguardando aprovação</p>
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-ink-400 text-xs font-body">{users.length} pendente{users.length !== 1 ? 's' : ''}</span>
        <button onClick={load} className="text-ink-500 hover:text-ink-300 transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>
      {users.map(u => (
        <div key={u.id} className="bg-ink-800 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-heading font-bold text-ink-100">{u.display_name}</p>
              <p className="text-ink-400 text-sm font-body">{u.email}</p>
            </div>
            <span className="text-ink-600 text-xs font-body flex-shrink-0 mt-0.5">
              {new Date(u.created_at).toLocaleDateString('pt-BR')}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="bg-ink-700 text-ink-300 text-xs font-body px-2.5 py-1 rounded-lg">
              📍 {u.address_display}
            </span>
            {u.whatsapp && (
              <span className="bg-ink-700 text-ink-300 text-xs font-body px-2.5 py-1 rounded-lg">
                💬 {u.whatsapp}
              </span>
            )}
          </div>

          <button
            onClick={() => approve(u.id, u.display_name)}
            disabled={approving === u.id}
            className="w-full py-3 bg-verde-500 hover:bg-verde-600 disabled:opacity-50 rounded-xl font-heading font-bold text-white text-sm transition-colors flex items-center justify-center gap-2"
          >
            {approving === u.id ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <><Check size={16} />Aprovar acesso</>
            )}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Aba Consulta ─────────────────────────────────────────────────────────────

function TabConsulta() {
  const [stats, setStats] = useState<UserStat[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = getSupabaseClient()
    // SECURITY DEFINER — bypassa RLS para ler stickers de todos os usuários
    const { data, error } = await (supabase as any).rpc('get_users_stats')
    if (error) toast.error('Erro ao carregar: ' + error.message)
    else setStats((data ?? []) as UserStat[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-ink-400 text-xs font-body">{stats.length} usuário{stats.length !== 1 ? 's' : ''} aprovado{stats.length !== 1 ? 's' : ''}</span>
        <button onClick={load} className="text-ink-500 hover:text-ink-300 transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="bg-ink-800 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_80px_80px] gap-0 px-4 py-2.5 border-b border-ink-700">
          <span className="text-ink-500 text-xs font-body uppercase tracking-wider">Usuário</span>
          <span className="text-ink-500 text-xs font-body uppercase tracking-wider text-center">Coladas</span>
          <span className="text-ink-500 text-xs font-body uppercase tracking-wider text-center">Repet.</span>
        </div>

        {/* Rows */}
        {stats.map((u, i) => (
          <div
            key={u.id}
            className="grid grid-cols-[1fr_80px_80px] gap-0 px-4 py-3"
            style={{ borderBottom: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
          >
            <p className="font-heading font-semibold text-ink-100 text-sm truncate">{u.display_name}</p>
            <p className="text-center font-mono font-bold text-sm" style={{ color: '#4ADE80' }}>
              {u.coladas}
            </p>
            <p className="text-center font-mono font-bold text-sm" style={{ color: u.repetidas > 0 ? '#FBBF24' : '#475569' }}>
              {u.repetidas}
            </p>
          </div>
        ))}

        {stats.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-ink-500 font-body text-sm">Nenhum usuário aprovado ainda</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('aprovacao')
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const check = async () => {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email !== ADMIN_EMAIL) router.replace('/home')
      else setAuthChecked(true)
    }
    check()
  }, [router])

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-ink-900 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'aprovacao', label: 'Aprovação', icon: <Users size={15} /> },
    { key: 'consulta',  label: 'Consulta',  icon: <BarChart2 size={15} /> },
  ]

  return (
    <main className="min-h-screen bg-ink-900 px-4 py-6 pt-safe pb-safe">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xl">🛡️</span>
          <h1 className="font-heading font-bold text-xl text-ink-100">Admin</h1>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-ink-800 p-1 mb-5 gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-heading font-semibold transition-all"
              style={{
                background: tab === t.key ? '#F59E0B' : 'transparent',
                color: tab === t.key ? '#0F172A' : '#64748B',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'aprovacao' && <TabAprovacao />}
        {tab === 'consulta'  && <TabConsulta />}
      </div>
    </main>
  )
}
