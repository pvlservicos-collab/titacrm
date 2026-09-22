'use client'

/**
 * O que cada fonte (Agenda, site, cadastro manual) mandou sobre um lead —
 * GET /api/leads/{id}/submissions.
 *
 * O painel do lead usa em dois lugares: as "Informações pessoais" (profissão,
 * renda, investimento — as respostas dos formulários finais) e o cartão da
 * Agenda. Buscar uma vez e repartir evita duas requisições iguais a cada
 * conversa aberta. A busca em andamento fica guardada por lead, então quem
 * pedir no mesmo instante pega a mesma resposta.
 */
import { useEffect, useState } from 'react'

export interface LeadSubmission {
  id: string
  source: string
  source_label: string
  external_id: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  instagram: string | null
  payload: Record<string, any>
  received_at: string
  updated_at: string
}

const emAndamento = new Map<string, Promise<LeadSubmission[]>>()

function buscar(leadId: string): Promise<LeadSubmission[]> {
  const existente = emAndamento.get(leadId)
  if (existente) return existente
  const promessa = fetch(`/api/leads/${leadId}/submissions`)
    .then((res) => (res.ok ? res.json() : { data: [] }))
    .then(({ data }) => (data || []) as LeadSubmission[])
    .catch(() => [] as LeadSubmission[])
    .finally(() => {
      // Curto de propósito: é só pra juntar pedidos simultâneos. Reabrir o
      // lead depois busca de novo e pega o que chegou nesse meio-tempo.
      setTimeout(() => emAndamento.delete(leadId), 2000)
    })
  emAndamento.set(leadId, promessa)
  return promessa
}

export function useLeadSubmissions(leadId: string | null | undefined) {
  const [submissions, setSubmissions] = useState<LeadSubmission[]>([])
  const [loading, setLoading] = useState(!!leadId)

  useEffect(() => {
    if (!leadId) { setSubmissions([]); setLoading(false); return }
    let cancelado = false
    setLoading(true)
    buscar(leadId).then((dados) => {
      if (cancelado) return
      setSubmissions(dados)
      setLoading(false)
    })
    return () => { cancelado = true }
  }, [leadId])

  return { submissions, loading }
}
