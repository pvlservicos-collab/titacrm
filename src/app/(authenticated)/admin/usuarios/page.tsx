'use client'

import { Fragment, useEffect, useState } from 'react'
import { CaretDown, CaretRight, CheckCircle, XCircle } from '@phosphor-icons/react'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'
import OrgDetailModal from '@/components/Admin/OrgDetailModal'

interface Member {
  memberId: string
  userId: string
  roleId: string
  fullName: string | null
  email: string
  roleName: string
}

interface OrgRow {
  id: string
  name: string
  subscriptionStatus: string
  createdAt: string
  totalMessages: number
  whatsapp: {
    integrationId: string
    wabaId: string
    phoneNumberId: string
    graphApiVersion: string
    hasSystemToken: boolean
  } | null
  owner: Member | null
  members: Member[]
}

const STATUS_STYLES: Record<string, string> = {
  active: 'text-emerald-400 bg-emerald-500/10',
  unpaid: 'text-amber-400 bg-amber-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativa',
  unpaid: 'Não pago',
  cancelled: 'Cancelado',
}

export default function AdminUsuariosPage() {
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = () => {
    fetch('/api/admin/organizations')
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || 'Erro ao carregar organizações')
        return res.json()
      })
      .then(setOrgs)
      .catch((err) => setError(err.message))
  }

  useEffect(load, [])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {!orgs && !error && <LoadingSpinner text="Carregando organizações..." size="lg" />}

      {orgs && (
        <div className="bg-panel border border-line rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted uppercase tracking-wide">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Organização</th>
                <th className="px-4 py-3">Dono</th>
                <th className="px-4 py-3">Mensagens</th>
                <th className="px-4 py-3">WABA ID</th>
                <th className="px-4 py-3">Phone Number ID</th>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Assinatura</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <Fragment key={org.id}>
                  <tr
                    onClick={() => setSelectedId(org.id)}
                    className="border-b border-line hover:bg-panel-2 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === org.id ? null : org.id) }}>
                      {expandedId === org.id ? <CaretDown size={16} className="text-muted" /> : <CaretRight size={16} className="text-muted" />}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{org.name}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {org.owner ? (org.owner.fullName || org.owner.email) : '—'}
                    </td>
                    <td className="px-4 py-3 text-ink">{org.totalMessages.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">{org.whatsapp?.wabaId || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">{org.whatsapp?.phoneNumberId || '—'}</td>
                    <td className="px-4 py-3">
                      {org.whatsapp?.hasSystemToken ? (
                        <CheckCircle size={18} weight="fill" className="text-emerald-400" />
                      ) : (
                        <XCircle size={18} weight="fill" className="text-red-400" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLES[org.subscriptionStatus] || 'text-muted bg-panel-2'}`}>
                        {STATUS_LABELS[org.subscriptionStatus] || org.subscriptionStatus}
                      </span>
                    </td>
                  </tr>
                  {expandedId === org.id && (
                    <tr className="border-b border-line bg-void">
                      <td></td>
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-1.5">
                          {org.members.map((m) => (
                            <div key={m.memberId} className="flex items-center gap-3 text-xs text-muted">
                              <span className="text-ink font-medium">{m.fullName || m.email}</span>
                              <span>{m.email}</span>
                              <span className="text-muted">{m.roleName}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <OrgDetailModal
          organizationId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={load}
        />
      )}
    </div>
  )
}
