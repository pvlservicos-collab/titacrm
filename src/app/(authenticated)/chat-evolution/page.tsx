'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth, useStageHistory, useLeadPipelineStages, usePipeline } from '@/hooks'
import { useLeadsContext } from '@/contexts/LeadsContext'
import { LeadList, ChatWindow, LeadDetailsSidebar } from '@/components/Chat'
import { LeadWithOwner } from '@/lib/types'
import NotAuthorized from '@/components/Shared/NotAuthorized'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'

const INTEGRATION_NAME = 'WhatsApp Evolution'

export default function ChatEvolutionPage() {
  const { organizationId, loading, permissions, isMaster, roleName, currentOrganization, user, profileName } = useAuth()
  const { leads: globalLeads, loading: leadsLoading, moveLeadToStage, setLeads } = useLeadsContext()
  const searchParams = useSearchParams()
  const leadIdFromUrl = searchParams.get('leadId')

  // Fetch the Evolution integration ID so we can filter leads
  const [evolutionIntegrationId, setEvolutionIntegrationId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!organizationId) return
    fetch(`/api/integrations?name=${encodeURIComponent(INTEGRATION_NAME)}`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(({ data }) => setEvolutionIntegrationId(data?.[0]?.id || null))
      .catch(() => setEvolutionIntegrationId(null))
  }, [organizationId])

  // Filter: only Evolution leads (integration_id matches the Evolution integration)
  const allLeads = globalLeads.filter(l => {
    if (evolutionIntegrationId === undefined) return false // still loading
    return l.integration_id === evolutionIntegrationId
  })

  const [selectedLead, setSelectedLead] = useState<LeadWithOwner | null>(null)

  /*
   * O `?leadId=` do endereço é aplicado UMA vez — quando ele muda —, e não a
   * cada renderização.
   *
   * Antes a regra rodava sempre que a lista ou a seleção mudavam, e reimpunha a
   * conversa do link: você chegava pelo link do aviso no grupo (ou pelo "Ver
   * conversa" do Pipeline), clicava em outra conversa, e a tela voltava pra do
   * link. Com a lista se atualizando sozinha a cada poucos segundos, isso virou
   * "clico no grupo e ele abre outro chat".
   */
  const leadIdAplicadoDaUrl = useRef<string | null>(null)

  useEffect(() => {
    if (!leadIdFromUrl) return
    if (leadIdAplicadoDaUrl.current === leadIdFromUrl) return
    if (selectedLead?.id === leadIdFromUrl) { leadIdAplicadoDaUrl.current = leadIdFromUrl; return }
    const fromMemory = globalLeads.find(l => l.id === leadIdFromUrl)
    if (fromMemory) { leadIdAplicadoDaUrl.current = leadIdFromUrl; setSelectedLead(fromMemory); return }
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/leads/${leadIdFromUrl}`)
      if (res.ok) {
        const { data } = await res.json()
        if (!cancelled && data) {
          leadIdAplicadoDaUrl.current = leadIdFromUrl
          setSelectedLead(data as LeadWithOwner)
        }
      }
    })()
    return () => { cancelled = true }
  }, [leadIdFromUrl, globalLeads, selectedLead?.id])

  const handleSelectLead = useCallback((lead: LeadWithOwner) => {
    // O endereço acompanha a conversa escolhida. Assim o link nunca contradiz o
    // que está na tela — e recarregar a página reabre a conversa certa, não a
    // do link por onde a pessoa entrou horas antes. replaceState (e não
    // router.replace) pra não custar uma ida ao servidor a cada clique.
    leadIdAplicadoDaUrl.current = lead.id
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('leadId', lead.id)
      window.history.replaceState(window.history.state, '', url.toString())
    }
    setSelectedLead(lead)
  }, [])

  const displayedLeadId = selectedLead?.id || (allLeads.length > 0 ? allLeads[0].id : null)
  const displayedLead = allLeads.find(l => l.id === displayedLeadId) || selectedLead
  const { stages: leadStages, loading: stagesLoading } = useLeadPipelineStages(displayedLead?.stage_id)
  const { history: stageHistory, loading: historyLoading } = useStageHistory(displayedLead?.id || '')
  const { pipelines, stagesMap, loading: pipelinesLoading } = usePipeline(organizationId || '')
  const currentPipelineId = leadStages.length > 0 ? leadStages[0]?.pipeline_id : undefined

  const handleStageChange = useCallback(async (newStageId: string) => {
    if (!displayedLead) return
    const oldStageId = displayedLead.stage_id
    if (selectedLead) setSelectedLead({ ...selectedLead, stage_id: newStageId })
    try {
      await moveLeadToStage(displayedLead.id, newStageId, oldStageId)
    } catch {
      if (selectedLead) setSelectedLead({ ...selectedLead, stage_id: oldStageId })
    }
  }, [displayedLead, selectedLead, moveLeadToStage])

  const handlePipelineChange = useCallback(async (newPipelineId: string) => {
    if (!displayedLead || !organizationId) return
    try {
      let firstStageId: string | undefined
      const cachedStages = stagesMap ? stagesMap[newPipelineId] : undefined
      if (cachedStages && cachedStages.length > 0) {
        firstStageId = cachedStages[0].id
      }
      if (!firstStageId) {
        const stagesRes = await fetch(`/api/pipelines/${newPipelineId}/stages`)
        if (!stagesRes.ok) return
        const { data: newStages } = await stagesRes.json()
        if (!newStages || newStages.length === 0) return
        firstStageId = newStages[0].id
      }
      if (firstStageId) await handleStageChange(firstStageId)
    } catch (err) {
      console.error('Failed to change pipeline:', err)
    }
  }, [displayedLead, organizationId, handleStageChange, stagesMap])

  const handleTagsChange = useCallback((targetLeadId: string, tagId: string, action: 'add' | 'remove', tagObj?: any) => {
    setLeads(prev => prev.map(l => {
      if (l.id !== targetLeadId) return l
      let newTags = [...(l.lead_tags || [])]
      if (action === 'add') {
        if (!newTags.find(t => t.tag_id === tagId)) newTags.push({ tag_id: tagId, tag: tagObj })
      } else {
        newTags = newTags.filter(t => t.tag_id !== tagId)
      }
      return { ...l, lead_tags: newTags }
    }))
    if (selectedLead?.id === targetLeadId) {
      setSelectedLead(prev => {
        if (!prev) return prev
        let newTags = [...(prev.lead_tags || [])]
        if (action === 'add') {
          if (!newTags.find(t => t.tag_id === tagId)) newTags.push({ tag_id: tagId, tag: tagObj })
        } else {
          newTags = newTags.filter(t => t.tag_id !== tagId)
        }
        return { ...prev, lead_tags: newTags }
      })
    }
  }, [setLeads, selectedLead])

  const handleChatMessageSent = useCallback((content: string) => {
    const memberId = currentOrganization?.id || ''
    const fullName = profileName || user?.name || user?.email || ''
    const leadId = displayedLead?.id
    // Só assume automaticamente quem respondeu se o lead ainda não tem responsável —
    // nunca sobrescreve uma atribuição manual feita por outra pessoa.
    const alreadyHasOwner = !!displayedLead?.owner_member_id

    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l
      const shouldAssign = !l.owner_member_id && memberId
      return {
        ...l,
        last_message_content: content,
        last_message_sender_type: 'human' as const,
        last_activity_at: new Date().toISOString(),
        owner_member_id: shouldAssign ? memberId : l.owner_member_id,
        owner: shouldAssign ? { id: memberId, profiles: { full_name: fullName, avatar_url: user?.image || undefined } } : l.owner,
      }
    }))
    if (selectedLead?.id === leadId) {
      setSelectedLead(prev => {
        if (!prev) return prev
        const shouldAssign = !prev.owner_member_id && memberId
        return {
          ...prev,
          last_message_content: content,
          last_message_sender_type: 'human' as const,
          last_activity_at: new Date().toISOString(),
          owner_member_id: shouldAssign ? memberId : prev.owner_member_id,
          owner: shouldAssign ? { id: memberId, profiles: { full_name: fullName, avatar_url: user?.image || undefined } } : prev.owner,
        }
      })
    }

    if (leadId && memberId && !alreadyHasOwner) {
      fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_member_id: memberId }),
      }).catch((err) => console.error('Failed to auto-assign owner:', err))
    }
  }, [displayedLead, selectedLead, setLeads, currentOrganization, user, profileName])

  const handleUpdateLead = useCallback((leadId: string, updates: Partial<LeadWithOwner>) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...updates } : l))
  }, [setLeads])

  const isAdmin = isMaster || roleName?.toLowerCase() === 'administrador' || roleName?.toLowerCase() === 'owner' || permissions?.['*']
  if (!loading && !isAdmin && permissions && !permissions.settings?.view_chat) {
    return <NotAuthorized />
  }

  if (loading || leadsLoading || evolutionIntegrationId === undefined || (!isAdmin && !permissions)) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--chat-bg-conversation)' }}>
        <LoadingSpinner text="Carregando Número 2..." size="lg" />
      </div>
    )
  }

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--chat-bg-conversation)' }}>
        <p className="text-muted">Nenhuma organização encontrada.</p>
      </div>
    )
  }

  return (
    <div className="chat-theme flex h-full gap-0">
      <div className="w-[340px] border-r border-[var(--chat-border)] flex-shrink-0">
        <LeadList
          leads={allLeads}
          selectedLeadId={displayedLead?.id}
          onSelectLead={handleSelectLead}
          onUpdateLead={handleUpdateLead}
          loading={false}
          organizationId={organizationId}
        />
      </div>

      <div className="flex-1 min-w-0">
        {displayedLead ? (
          <ChatWindow
            lead={displayedLead}
            organizationId={organizationId}
            onMessageSent={handleChatMessageSent}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ backgroundColor: 'var(--chat-bg-conversation)' }}>
            <p className="text-[var(--chat-text-muted)]">Nenhuma conversa no Número 2 ainda.</p>
            <p className="text-[var(--chat-text-tertiary)] text-sm">Configure a Evolution API em Configurações → Integrações → Número 2.</p>
          </div>
        )}
      </div>

      {displayedLead && (
        <LeadDetailsSidebar
          lead={displayedLead}
          stages={leadStages}
          stageHistory={stageHistory}
          stageHistoryLoading={historyLoading || stagesLoading}
          onStageChange={handleStageChange}
          onTagsChange={handleTagsChange}
          onUpdateLead={handleUpdateLead}
          pipelines={pipelines}
          currentPipelineId={currentPipelineId}
          onPipelineChange={handlePipelineChange}
        />
      )}
    </div>
  )
}
