'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, ArrowClockwise, ListBullets } from '@phosphor-icons/react'
import { formatDate, formatTime } from '@/lib/utils'
import { useAuth } from '@/hooks'
import NotAuthorized from '@/components/Shared/NotAuthorized'

interface LogEntry {
  id: string
  source: string
  direction: string | null
  phone: string | null
  content: string | null
  lead_id: string | null
  status: string
  error: string | null
  created_at: string
}

export default function LogsPage() {
  const { loading: authLoading, permissions, isMaster, roleName } = useAuth()
  const isAdmin = isMaster || roleName?.toLowerCase() === 'administrador' || roleName?.toLowerCase() === 'owner'
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/logs')
      if (res.ok) {
        const { data } = await res.json()
        setLogs(data || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  if (!authLoading && !isAdmin && permissions && !permissions.settings?.view_logs) {
    return <NotAuthorized />
  }

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListBullets size={20} weight="bold" className="text-gray-700" />
          <h1 className="text-lg font-bold text-gray-900">Logs de Mensagens (n8n)</h1>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wide"
        >
          <ArrowClockwise size={14} weight="bold" />
          Atualizar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <ListBullets size={48} weight="light" />
            <p className="text-sm font-medium">Nenhum log registrado ainda</p>
            <p className="text-xs text-gray-400 max-w-md text-center">
              Configure o webhook do n8n para enviar mensagens para
              <code className="mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">/api/webhooks/n8n-outbound</code>
              e os registros aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-2.5">Status</th>
                <th className="px-6 py-2.5">Data/Hora</th>
                <th className="px-6 py-2.5">Origem</th>
                <th className="px-6 py-2.5">Telefone</th>
                <th className="px-6 py-2.5">Conteúdo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/80">
                  <td className="px-6 py-3">
                    {log.status === 'success' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle size={16} weight="fill" /> Sucesso
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 font-medium" title={log.error || ''}>
                        <XCircle size={16} weight="fill" /> Erro
                      </span>
                    )}
                    {log.error && (
                      <p className="text-[11px] text-red-400 mt-0.5">{log.error}</p>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(log.created_at)} {formatTime(log.created_at)}
                  </td>
                  <td className="px-6 py-3 text-gray-700 capitalize">{log.source}</td>
                  <td className="px-6 py-3 text-gray-700">{log.phone || '—'}</td>
                  <td className="px-6 py-3 text-gray-700 max-w-md truncate">{log.content || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
