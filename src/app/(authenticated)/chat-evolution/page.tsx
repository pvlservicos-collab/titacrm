'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth, useStageHistory, useLeadPipelineStages, usePipeline } from '@/hooks'
import { useLeadsContext } from '@/contexts/LeadsContext'
import { LeadList, ChatWindow, LeadDetailsSidebar } from '@/components/Chat'
import LinhasEvolution, { ABA_ANTIGO, type LinhaEvolution } from '@/components/Chat/LinhasEvolution'
import { WarningCircle } from '@phosphor-icons/react'
import { LeadWithOwner } from '@/lib/types'
import NotAuthorized from '@/components/Shared/NotAuthorized'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'

/**
 * "Outros números": uma aba por linha da Evolution (Michele, Augusto, Cau) e a
 * do número antigo. As linhas só observam e respondem à mão — nunca recebem
 * automação (ver CLAUDE.md).
 */

/** Última conversa aberta nesta tela, pra reabrir no próximo acesso. */
const CHAVE_ULTIMA_CONVERSA = 'crm:ultima-conversa:evolution'

export default function ChatEvolutionPage() {
  const { organizationId, loading, permissions, isMaster, roleName, currentOrganization, user, profileName } = useAuth()
  const { leads: globalLeads, loading: leadsLoading, moveLeadToStage, setLeads } = useLeadsContext()
  const searchParams = useSearchParams()
  const leadIdFromUrl = searchParams.get('leadId')
  /*
   * Chave do pedido vindo do endereço: a conversa MAIS a marca de abertura que
   * os links internos carregam (ver src/lib/links.ts). Sem a marca, clicar duas
   * vezes no mesmo link seria o mesmo valor e a segunda vez não abriria nada.
   */
  const pedidoDaUrl = leadIdFromUrl ? `${leadIdFromUrl}|${searchParams.get('abrir') ?? ''}` : null

  // As linhas (Michele, Augusto, Cau) e se estão conectadas — undefined = ainda carregando.
  const [linhas, setLinhas] = useState<LinhaEvolution[] | undefined>(undefined)
  const [abaEscolhida, setAbaEscolhida] = useState<string | null>(null)
  const abaAtiva = abaEscolhida ?? linhas?.[0]?.id ?? ABA_ANTIGO

  const [comConversa, setComConversa] = useState<Set<string> | undefined>(undefined)

  const carregarLinhas = useCallback(async () => {
    try {
      const r = await fetch('/api/evolution/linhas')
      const j = r.ok ? await r.json() : { data: [] }
      setLinhas(j.data || [])
    } catch {
      setLinhas((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    if (!organizationId) return
    void carregarLinhas()
    // Mantém os pontinhos de conectado/desconectado em dia sem recarregar a tela.
    const t = setInterval(() => { void carregarLinhas() }, 30000)
    return () => clearInterval(t)
  }, [organizationId, carregarLinhas])

  useEffect(() => {
    if (!organizationId) return
    fetch('/api/leads/conversas-reais')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(({ data }) => setComConversa(new Set<string>(data || [])))
      .catch(() => setComConversa(new Set()))
  }, [organizationId])

  /*
   * Esta tela tem uma aba por linha da Evolution (Michele, Augusto, Cau) e a
   * do número antigo (Z-API, desligado).
   *
   * Linha: só as conversas daquela linha, sem filtro extra — são vivas.
   * Antigo: só o que teve conversa de verdade (mensagem que a pessoa mandou ou
   * que chegou nela). Tentativa que falhou com o número fora do ar e contato
   * importado do aparelho ficam de fora, sem apagar nada. Sem canal também é
   * daqui: o histórico dessa gente veio do número antigo, até alguém falar com
   * ela por um número novo.
   */
  const allLeads = globalLeads.filter(l => {
    if (linhas === undefined || comConversa === undefined) return false // ainda carregando
    if (abaAtiva === ABA_ANTIGO) {
      if (!comConversa.has(l.id)) return false
      return l.integration?.type === 'whatsapp_zapi' || !l.integration_id
    }
    return l.integration_id === abaAtiva
  })
  const linhaAtiva = linhas?.find((l) => l.id === abaAtiva) ?? null

  const abaDoLead = useCallback((l: LeadWithOwner) => {
    return linhas?.some((x) => x.id === l.integration_id) ? (l.integration_id as string) : ABA_ANTIGO
  }, [linhas])

  const [selectedLead, setSelectedLead] = useState<LeadWithOwner | null>(null)

  // Trocar de aba: some a conversa aberta da aba anterior e a da nova abre do topo.
  const conversaInicial = useRef<string | null>(null)
  const mudarAba = useCallback((aba: string) => {
    setAbaEscolhida(aba)
    setSelectedLead(null)
    conversaInicial.current = null
  }, [])

  /*
   * UMA fonte de verdade para a conversa aberta: o que a pessoa escolheu.
   *
   * O endereço (`?leadId=`) é só ENTRADA — serve pra chegar aqui pelo link do
   * aviso no grupo, pelo "Ver conversa" do Pipeline ou pela busca. Clicar numa
   * conversa não escreve mais no endereço, e é isso que mata de vez uma família
   * inteira de bugs: enquanto os dois lados escreviam, existia sempre um quadro
   * em que a seleção dizia uma coisa e o endereço ainda dizia outra, e alguém
   * tinha que ceder — foi assim que a tela ora abria a conversa errada, ora
   * congelava na anterior, ora não abria nada.
   *
   * Recarregar a página continua reabrindo a última conversa, agora pelo
   * navegador (localStorage) em vez do endereço. Guardar isso não pode
   * atrapalhar nada: se falhar, a tela só abre na conversa do topo.
   */
  /** Último pedido do endereço que este efeito viu — só pedido NOVO manda. */
  const ultimaUrlVista = useRef<string | null>(null)

  useEffect(() => {
    if (!leadIdFromUrl) return
    if (pedidoDaUrl === ultimaUrlVista.current) return
    ultimaUrlVista.current = pedidoDaUrl
    if (selectedLead?.id === leadIdFromUrl) return
    const fromMemory = globalLeads.find(l => l.id === leadIdFromUrl)
    // Link direto pra uma conversa: abre na aba da linha a que ela pertence.
    if (fromMemory) { setAbaEscolhida(abaDoLead(fromMemory)); setSelectedLead(fromMemory); return }
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/leads/${leadIdFromUrl}`)
      if (res.ok) {
        const { data } = await res.json()
        if (!cancelled && data) {
          setAbaEscolhida(abaDoLead(data as LeadWithOwner))
          setSelectedLead(data as LeadWithOwner)
        }
      }
    })()
    return () => { cancelled = true }
  }, [leadIdFromUrl, pedidoDaUrl, globalLeads, selectedLead?.id, abaDoLead])

  const handleSelectLead = useCallback((lead: LeadWithOwner) => {
    setSelectedLead(lead)
    // Pra reabrir aqui no próximo acesso. Best-effort: navegador anônimo ou
    // armazenamento bloqueado não pode impedir a conversa de abrir.
    try {
      localStorage.setItem(CHAVE_ULTIMA_CONVERSA, lead.id)
    } catch {}
  }, [])

  // Sem clique ainda, abre a conversa do topo — mas a que estava no topo na
  // hora de abrir a tela, e fica nela. Antes era "a do topo agora": com a lista
  // se reordenando sozinha, a conversa na tela trocava sem ninguém clicar.
  if (!conversaInicial.current && allLeads.length > 0) {
    // A última que esta pessoa abriu, se ainda estiver na lista; senão a do topo.
    let guardada: string | null = null
    try {
      guardada = localStorage.getItem(CHAVE_ULTIMA_CONVERSA)
    } catch {}
    conversaInicial.current =
      guardada && allLeads.some((l) => l.id === guardada) ? guardada : allLeads[0].id
  }
  const displayedLeadId = selectedLead?.id || conversaInicial.current
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

  if (loading || leadsLoading || linhas === undefined || (!isAdmin && !permissions)) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--chat-bg-conversation)' }}>
        <LoadingSpinner text="Carregando os outros números..." size="lg" />
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

  const naAbaAntiga = abaAtiva === ABA_ANTIGO
  // Linha desconectada: dá pra ler o histórico, mas o campo de envio some (mesma
  // regra do número antigo) — mensagem digitada sem número por trás não chegaria.
  const semNumeroConectado = naAbaAntiga || linhaAtiva?.estado !== 'conectado'

  return (
    <div className="chat-theme flex flex-col h-full">
      <LinhasEvolution
        linhas={linhas}
        abaAtiva={abaAtiva}
        onMudarAba={mudarAba}
        onAtualizar={carregarLinhas}
      />

      <div className="flex flex-1 min-h-0 gap-0">
        <div className="w-[340px] border-r border-[var(--chat-border)] flex-shrink-0">
          <LeadList
            leads={allLeads}
            selectedLeadId={displayedLead?.id}
            onSelectLead={handleSelectLead}
            onUpdateLead={handleUpdateLead}
            loading={false}
            organizationId={organizationId}
            // Só o número antigo fica em cinza: conversa parada. Quem escreve por
            // um número novo vira lead da API Oficial e sai daqui.
            esmaecer={naAbaAntiga ? () => true : undefined}
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {displayedLead ? (
            <>
              {naAbaAntiga && (
                <div className="flex items-center gap-2 px-4 py-2 text-xs flex-shrink-0" style={{ backgroundColor: 'var(--chat-bg-hover)', borderBottom: '1px solid var(--chat-border)', color: 'var(--chat-text-secondary)' }}>
                  <WarningCircle size={15} weight="fill" className="flex-shrink-0" style={{ color: 'var(--chat-accent)' }} />
                  <span>Esta conversa era de outro número, hoje desconectado. Pra falar com esse contato de novo, use um número conectado.</span>
                </div>
              )}
              <div className="flex-1 min-h-0">
                <ChatWindow
                  // Uma conversa = uma área de tela: trocar de lead remonta tudo, e
                  // nada da conversa anterior (mensagens, rascunho, fixadas) sobra.
                  key={displayedLead.id}
                  lead={displayedLead}
                  organizationId={organizationId}
                  onMessageSent={handleChatMessageSent}
                  somenteLeitura={semNumeroConectado
                    ? { motivo: naAbaAntiga ? 'não é possível enviar mensagens por aqui.' : 'esta linha está desconectada — conecte pelo cartão no topo pra responder.' }
                    : undefined}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3" style={{ backgroundColor: 'var(--chat-bg-conversation)' }}>
              <p className="text-[var(--chat-text-muted)]">
                {naAbaAntiga ? 'Nenhuma conversa antiga.' : 'Nenhuma conversa nesta linha ainda.'}
              </p>
              {!naAbaAntiga && linhaAtiva?.estado !== 'conectado' && (
                <p className="text-[var(--chat-text-tertiary)] text-sm">Conecte o número pelo cartão no topo pra as conversas aparecerem aqui.</p>
              )}
            </div>
          )}
        </div>

        {displayedLead && (
          <LeadDetailsSidebar
            key={displayedLead.id}
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
    </div>
  )
}
