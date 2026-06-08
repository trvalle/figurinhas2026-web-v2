'use client'
import { useRef, useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { getSupabaseClient } from '@/services/supabase'
import { useInventarioStore } from '@/stores/inventarioStore'

const ADMIN_EMAIL = 'trvalle@gmail.com'

interface SettingsModalProps {
  onExportPDF?: () => void
}

const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME
const BUILD_LABEL = BUILD_TIME
  ? new Date(BUILD_TIME).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', '')
  : '—'

export function SettingsModal({ onExportPDF }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const clearInventario = useInventarioStore((s) => s.clearInventario)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    getSupabaseClient()
      .auth.getUser()
      .then(({ data }) => setIsAdmin(data.user?.email === ADMIN_EMAIL))
  }, [])

  const open = useCallback(() => dialogRef.current?.showModal(), [])
  const close = useCallback(() => dialogRef.current?.close(), [])

  const handleSignOut = async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleZerarAlbum = async () => {
    if (!confirm('Zerar todo o álbum? Esta ação não pode ser desfeita.')) return
    await clearInventario()
    close()
  }

  const items = [
    { icon: '⚙️', label: 'Configurar álbum', action: () => { close(); router.push('/onboarding') } },
    { icon: '📄', label: 'Exportar PDF', action: () => { close(); onExportPDF?.() } },
    { icon: '👤', label: 'Editar perfil', action: () => { close(); router.push('/perfil') } },
    ...(isAdmin ? [{ icon: '🛡️', label: 'Admin — Aprovações', action: () => { close(); router.push('/admin') }, admin: true }] : []),
    { icon: '🗑️', label: 'Zerar álbum', action: handleZerarAlbum, danger: true },
    { icon: '🚪', label: 'Sair', action: handleSignOut, danger: true },
  ]

  return (
    <>
      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={open}
          className="w-10 h-10 rounded-full bg-white/6 flex items-center justify-center text-ink-400 hover:bg-white/10 transition-colors"
          aria-label="Configurações"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <span className="text-ink-600 font-mono" style={{ fontSize: 9 }}>{BUILD_LABEL}</span>
      </div>

      <dialog
        ref={dialogRef}
        className="m-0 w-full max-w-full bg-transparent p-0 outline-none backdrop:bg-ink-900/80 backdrop:backdrop-blur-sm"
        style={{ marginTop: 'auto', marginBottom: 0, maxHeight: '90vh' }}
        onClick={(e) => { if (e.target === dialogRef.current) close() }}
      >
        <style>{`
          dialog[open] > div {
            animation: slideUp 240ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          }
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        <div className="bg-ink-800 rounded-t-2xl pt-3 pb-safe">
          <div className="w-10 h-1 bg-ink-600 rounded-full mx-auto mb-4" />

          <div className="flex items-center justify-between px-5 mb-2">
            <h2 className="font-heading font-bold text-ink-100 text-lg">Configurações</h2>
            <button
              onClick={close}
              className="w-8 h-8 flex items-center justify-center text-ink-400 hover:text-ink-200 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="divide-y divide-ink-700/50">
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => void item.action()}
                className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/4 active:bg-white/6 ${
                  item.danger ? 'text-scarlet-400' : 'admin' in item ? 'text-cobalt-400' : 'text-ink-200'
                }`}
              >
                <span className="text-xl w-7 flex-shrink-0 text-center">{item.icon}</span>
                <span className="font-body text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </div>

          <p className="text-center text-ink-700 font-mono pb-2 pt-3" style={{ fontSize: 10 }}>
            build {BUILD_LABEL}
          </p>
        </div>
      </dialog>
    </>
  )
}
