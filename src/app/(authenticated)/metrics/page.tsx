'use client'

import { useEffect, useState } from 'react'
import { ChartBar, ArrowClockwise, ChatCircleText, CheckCircle, XCircle } from '@phosphor-icons/react'
import { useAuth } from '@/hooks'
import NotAuthorized from '@/components/Shared/NotAuthorized'

interface MessageStage {
  block_id: string
  type: 'message'
  label: string
  total: number
}

interface ConditionStage {
  block_id: string
  type: 'condition'
  label: string
  sim: number
  nao: number
}

type Stage = MessageStage | ConditionStage

interface FigurinhaMetrics {
  funnel_name: string
  entradas: number
  stages: Stage[]
}

export default function MetricsPage() {
  const { loading: authLoading, permissions, isMaster, roleName } = useAuth()
  const isAdmin = isMaster || roleName?.toLowerCase() === 'administrador' || roleName?.toLowerCase() === 'owner'
  const [metrics, setMetrics] = useState<FigurinhaMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/metrics/figurinha')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao carregar métricas.')
      }
      const { data } = await res.json()
      setMetrics(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [])

  if (!authLoading && !isAdmin && permissions && !permissions.settings?.view_metrics) {
    return <NotAuthorized />
  }

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChartBar size={20} weight="bold" className="text-gray-700" />
          <h1 className="text-lg font-bold text-gray-900">Métricas</h1>
        </div>
        <button
          onClick={fetchMetrics}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wide"
        >
          <ArrowClockwise size={14} weight="bold" />
          Atualizar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : !metrics ? null : (
          <div className="max-w-2xl">
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-900">{metrics.funnel_name}</h2>
              <p className="text-xs text-gray-500 mt-1">
                Quantidade de leads que entraram e avançaram em cada etapa do funil de geração de figurinha.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-900">Entradas no funil</span>
              <span className="text-2xl font-bold text-blue-700">{metrics.entradas}</span>
            </div>

            <div className="flex flex-col gap-3">
              {metrics.stages.map((stage) => (
                <div key={stage.block_id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <ChatCircleText size={16} weight="bold" className="text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium text-gray-800 leading-snug">{stage.label}</p>
                  </div>

                  {stage.type === 'message' ? (
                    <div className="flex items-center justify-between pl-6">
                      <span className="text-xs text-gray-500">Leads que receberam</span>
                      <span className="text-lg font-bold text-gray-900">{stage.total}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 pl-6">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle size={14} weight="fill" className="text-emerald-500" />
                        <span className="text-xs text-gray-500">Sim</span>
                        <span className="text-sm font-bold text-emerald-600">{stage.sim}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <XCircle size={14} weight="fill" className="text-rose-500" />
                        <span className="text-xs text-gray-500">Não</span>
                        <span className="text-sm font-bold text-rose-600">{stage.nao}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
