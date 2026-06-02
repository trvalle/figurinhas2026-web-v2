'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getSupabaseClient } from '@/services/supabase'

const ADMIN_EMAIL = 'trvalle@gmail.com'

const PRDScanner = dynamic(
  () => import('@/components/scanner/PRDScanner'),
  { ssr: false },
)

export default function PrdScannerPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // Verificar autenticação do admin
  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      const isAdminUser = data.user?.email === ADMIN_EMAIL
      setIsAdmin(isAdminUser)
      setAuthChecked(true)
      if (!isAdminUser) {
        router.replace('/home')
      }
    })
  }, [router])

  if (!authChecked || !isAdmin) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ink-900">
        <div className="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <PRDScanner
      stickers={[]}
      onConfirm={() => router.back()}
      onClose={() => router.back()}
    />
  )
}
