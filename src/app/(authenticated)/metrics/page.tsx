'use client'

import { ChartBar } from '@phosphor-icons/react'
import { useAuth } from '@/hooks'
import NotAuthorized from '@/components/Shared/NotAuthorized'

export default function MetricsPage() {
  const { loading: authLoading, permissions, isMaster, roleName } = useAuth()
  const isAdmin = isMaster || roleName?.toLowerCase() === 'administrador' || roleName?.toLowerCase() === 'owner'

  if (!authLoading && !isAdmin && permissions && !permissions.settings?.view_metrics) {
    return <NotAuthorized />
  }

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-2">
        <ChartBar size={20} weight="bold" className="text-gray-700" />
        <h1 className="text-lg font-bold text-gray-900">Métricas</h1>
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p className="text-sm">Nenhuma métrica disponível.</p>
      </div>
    </div>
  )
}
