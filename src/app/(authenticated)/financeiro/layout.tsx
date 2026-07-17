'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks'
import NotAuthorized from '@/components/Shared/NotAuthorized'

const TABS = [
  { label: 'Visão geral', href: '/financeiro' },
  { label: 'Contas a pagar', href: '/financeiro/contas-a-pagar' },
]

export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { loading, permissions, isMaster, roleName } = useAuth()
  const isAdmin = isMaster || roleName?.toLowerCase() === 'administrador' || roleName?.toLowerCase() === 'owner'

  if (!loading && !isAdmin && permissions && !permissions.settings?.view_financeiro) {
    return <NotAuthorized />
  }

  return (
    <div className="min-h-screen bg-void">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex items-center gap-1 border-b border-line">
          {TABS.map(tab => {
            const isActive = tab.href === '/financeiro' ? pathname === tab.href : pathname.startsWith(tab.href)
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
