'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Camera, Package, ArrowLeftRight, FlaskConical, Microscope } from 'lucide-react'
import { getSupabaseClient } from '@/services/supabase'

const ADMIN_EMAIL = 'trvalle@gmail.com'

const baseTabs = [
  { href: '/home',       label: 'Home',      icon: Home },
  { href: '/scan',       label: 'Scan',       icon: Camera,          isScan: true },
  { href: '/inventario', label: 'Inventário', icon: Package },
  { href: '/trocas',     label: 'Trocas',     icon: ArrowLeftRight },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      setIsAdmin(data.user?.email === ADMIN_EMAIL)
    })
  }, [])

  const tabs = isAdmin
    ? [...baseTabs, { href: '/prd-scanner', label: 'PRD', icon: Microscope }]
    : baseTabs

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-ink-800/95 backdrop-blur-md border-t border-white/7 pb-safe">
      <div className="flex justify-around items-center h-16">
        {tabs.map(({ href, label, icon: Icon, isScan }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          if (isScan) {
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-1 -mt-6"
              >
                <span
                  className={[
                    'w-14 h-14 rounded-full flex items-center justify-center shadow-lg',
                    'transition-all duration-150',
                    isActive ? 'bg-gold-400' : 'bg-gold-500',
                  ].join(' ')}
                >
                  <Icon size={26} className="text-ink-900" strokeWidth={2.5} />
                </span>
                <span
                  className={[
                    'text-xs font-body',
                    isActive ? 'text-gold-400' : 'text-ink-500',
                  ].join(' ')}
                >
                  {label}
                </span>
              </Link>
            )
          }
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 px-3 py-1 transition-colors duration-150"
            >
              <Icon
                size={22}
                className={isActive ? 'text-gold-400' : 'text-ink-500'}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={[
                  'text-xs font-body',
                  isActive ? 'text-gold-400' : 'text-ink-500',
                ].join(' ')}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
