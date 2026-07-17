'use client'

import { useEffect, useState } from 'react'
import { Users, ChatCircleDots, Buildings } from '@phosphor-icons/react'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'

interface Metrics {
  totalUsers: number
  totalOrganizations: number
  totalMessages: number
}

const CARDS = [
  { key: 'totalUsers', label: 'Usuários totais', icon: Users },
  { key: 'totalOrganizations', label: 'Organizações totais', icon: Buildings },
  { key: 'totalMessages', label: 'Mensagens totais', icon: ChatCircleDots },
] as const

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/metrics')
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || 'Erro ao carregar métricas')
        return res.json()
      })
      .then(setMetrics)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {loading && <LoadingSpinner text="Carregando métricas..." size="lg" />}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CARDS.map(({ key, label, icon: Icon }) => (
            <div key={key} className="bg-panel border border-line rounded-2xl p-6 flex items-center gap-4">
              <div className="bg-panel-2 rounded-xl p-3">
                <Icon size={24} weight="bold" className="text-accent-2" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink">{metrics[key].toLocaleString('pt-BR')}</p>
                <p className="text-sm text-muted">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
