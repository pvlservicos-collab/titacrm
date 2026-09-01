'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { LeadWithOwner } from '@/lib/types'
import { useAuth } from '@/hooks'
import { usePusherChannel } from '@/hooks/usePusher'
import { DEMO_ORG_ID, demoLeads } from '@/lib/demoData'

interface StageStats {
  count: number
  totalValue: number
}

interface LeadsContextType {
  leads: LeadWithOwner[]
  setLeads: React.Dispatch<React.SetStateAction<LeadWithOwner[]>>
  loading: boolean
  error: string | null
  stageStats: Record<string, StageStats>
  moveLeadToStage: (leadId: string, newStageId: string, oldStageId?: string, memberId?: string) => Promise<void>
}

const LeadsContext = createContext<LeadsContextType | undefined>(undefined)

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { currentOrganization, permissions } = useAuth()
  const [leads, setLeads] = useState<LeadWithOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stageStats, setStageStats] = useState<Record<string, StageStats>>({})

  const organizationId = currentOrganization?.organization_id

  async function fetchLeads(showLoading = true) {
    if (!organizationId) { setLoading(false); return }
    // TEMPORÁRIO: org demo do bypass de login não existe no banco — usa os leads
    // fake direto em vez de bater na API. Reverter junto com AuthGuard/middleware.
    if (organizationId === DEMO_ORG_ID) {
      setLeads(demoLeads)
      const stats: Record<string, StageStats> = {}
      for (const lead of demoLeads) {
        if (!lead.stage_id || lead.is_group) continue
        if (!stats[lead.stage_id]) stats[lead.stage_id] = { count: 0, totalValue: 0 }
        stats[lead.stage_id].count++
        stats[lead.stage_id].totalValue += lead.value || 0
      }
      setStageStats(stats)
      setLoading(false)
      return
    }
    try {
      if (showLoading) setLoading(true)
      setError(null)
      const viewOwnOnly = permissions?.leads?.view_own_only
      const memberId = currentOrganization?.id
      // Grupos entram na lista (o Chat precisa deles); quem não quer ver grupo
      // (Pipeline) já filtra por conta própria em PipelineBoard.tsx.
      const params = new URLSearchParams({ returnAll: 'true' })
      if (viewOwnOnly && memberId) params.set('owner', memberId)
      const res = await fetch(`/api/leads?${params}`)
      if (!res.ok) throw new Error('Failed to fetch leads')
      const { data } = await res.json()
      setLeads(data || [])

      // Compute stage stats — grupo não conta pra estatística do Pipeline
      const stats: Record<string, StageStats> = {}
      for (const lead of (data || [])) {
        if (!lead.stage_id || lead.is_group) continue
        if (!stats[lead.stage_id]) stats[lead.stage_id] = { count: 0, totalValue: 0 }
        stats[lead.stage_id].count++
        stats[lead.stage_id].totalValue += lead.value || 0
      }
      setStageStats(stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch leads')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeads()
  }, [organizationId, currentOrganization?.id])

  // Real-time via Pusher
  usePusherChannel(
    organizationId ? `org-${organizationId}` : '',
    {
      'lead.created': () => fetchLeads(false),
      'lead.updated': () => fetchLeads(false),
      'lead.deleted': (data: any) => {
        if (data?.id) setLeads(prev => prev.filter(l => l.id !== data.id))
      },
      '__reconnected': () => fetchLeads(false),
    }
  )

  const moveLeadToStage = useCallback(
    async (leadId: string, newStageId: string, oldStageId?: string) => {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: newStageId } : l))
      if (organizationId === DEMO_ORG_ID) return
      try {
        const res = await fetch(`/api/leads/${leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage_id: newStageId }),
        })
        if (!res.ok) throw new Error('Failed to update lead stage')
      } catch (err) {
        console.error('Failed to update lead stage:', err)
        if (oldStageId) {
          setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: oldStageId } : l))
        }
        throw err
      }
    },
    [organizationId]
  )

  return (
    <LeadsContext.Provider value={{ leads, setLeads, loading, error, stageStats, moveLeadToStage }}>
      {children}
    </LeadsContext.Provider>
  )
}

export function useLeadsContext() {
  const context = useContext(LeadsContext)
  if (context === undefined) throw new Error('useLeadsContext must be used within a LeadsProvider')
  return context
}
