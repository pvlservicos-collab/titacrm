'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldCheck } from '@phosphor-icons/react'
import { useAuth } from '@/hooks'
import NotAuthorized from '@/components/Shared/NotAuthorized'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'

const TABS = [
  { label: 'Métricas', href: '/admin' },
  { label: 'Usuários', href: '/admin/usuarios' },
]

// Painel /admin (plataforma inteira) — gate por profiles.isSuperadmin (isMaster),
// nunca por papel de organização. Ver mesma decisão em src/lib/api-auth.ts.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { loading, isMaster } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <LoadingSpinner text="Carregando..." size="lg" />
      </div>
    )
  }

  if (!isMaster) return <NotAuthorized />

  return (
    <div className="min-h-screen bg-void">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex items-center gap-3 pb-4">
          <ShieldCheck size={28} className="text-accent-2" weight="fill" />
          <div>
            <h1 className="text-2xl font-bold text-ink">Painel Administrativo</h1>
            <p className="text-sm text-muted">Visão geral da plataforma — restrito a founders</p>
          </div>
        </div>
        <div className="flex items-center gap-1 border-b border-line">
          {TABS.map(tab => {
            const isActive = tab.href === '/admin' ? pathname === tab.href : pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? 'border-accent text-accent-2'
                    : 'border-transparent text-muted hover:text-muted hover:border-line'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
      {children}
    </div>
  )
}
