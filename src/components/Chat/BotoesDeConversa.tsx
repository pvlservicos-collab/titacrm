'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChatText, ClockCounterClockwise } from '@phosphor-icons/react'
import type { LeadWithOwner } from '@/lib/types'
import { linkDaConversaNaLinha } from '@/lib/links'

interface Linha { id: string; nome: string }

interface Props {
  lead: LeadWithOwner
  /** Fecha o painel de onde o botão foi clicado (o Pipeline abre este card por cima). */
  onClose?: () => void
  /** O "Ver conversa" de sempre — API Oficial e Instagram. */
  onGoToConversation: () => void
}

/**
 * Como abrir a conversa deste lead, conforme por onde ele já falou:
 *
 *  - API Oficial / Instagram / sem conversa: "Ver conversa", como sempre;
 *  - número antigo (Z-API): "Ver conversa do número antigo";
 *  - e sempre "Conversar por Augusto / Michele / Cau", que liga o lead àquela
 *    linha e abre o chat já na aba dela — é por essa linha que a resposta sai.
 */
export default function BotoesDeConversa({ lead, onClose, onGoToConversation }: Props) {
  const router = useRouter()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch('/api/evolution/linhas?leve=1')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => { if (!cancelado) setLinhas((j.data || []).map((l: Linha) => ({ id: l.id, nome: l.nome }))) })
      .catch(() => {})
    return () => { cancelado = true }
  }, [])

  const tipo = lead.integration?.type
  const noAntigo = tipo === 'whatsapp_zapi' || (!lead.integration_id && !!lead.last_activity_type)
  const naEvolution = tipo === 'whatsapp_evolution'
  const podeConversarPorLinha = !!lead.phone && !lead.is_group && tipo !== 'instagram_direct'

  function ir(url: string) {
    onClose?.()
    router.push(url)
  }

  async function conversarPor(linha: Linha) {
    setErro(null)
    if (lead.integration_id === linha.id) return ir(linkDaConversaNaLinha(lead.id, linha.id))
    setAbrindo(linha.id)
    try {
      const res = await fetch(`/api/leads/${lead.id}/conversar-por`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linhaId: linha.id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Não deu pra abrir por esta linha.')
      }
      ir(linkDaConversaNaLinha(lead.id, linha.id))
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setAbrindo(null)
    }
  }

  const principal = 'w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[var(--chat-accent)] text-[var(--chat-bg-conversation)] hover:opacity-90 transition-opacity'
  const secundario = 'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--chat-border)] text-[var(--chat-text-primary)] hover:bg-[var(--chat-bg-hover)] transition-colors disabled:opacity-60'

  return (
    <div className="space-y-2">
      {!noAntigo && !naEvolution && (
        <button onClick={onGoToConversation} className={principal}>
          <ChatText size={16} weight="bold" />
          Ver conversa
        </button>
      )}

      {noAntigo && (
        <button onClick={() => ir(linkDaConversaNaLinha(lead.id, 'antigo'))} className={principal}>
          <ClockCounterClockwise size={16} weight="bold" />
          Ver conversa do número antigo
        </button>
      )}

      {podeConversarPorLinha && linhas.length > 0 && (
        <div className={`space-y-2 ${noAntigo || !naEvolution ? '' : 'mt-3'}`}>
          {linhas.map((l) => {
            const atual = lead.integration_id === l.id
            return (
              <button
                key={l.id}
                onClick={() => conversarPor(l)}
                disabled={abrindo !== null}
                className={atual ? principal.replace('mt-3 ', '') : secundario}
              >
                <ChatText size={16} weight={atual ? 'bold' : 'regular'} />
                {abrindo === l.id ? 'Abrindo…' : `Conversar por ${l.nome}`}
                {atual && <span className="text-[11px] font-semibold opacity-80">· atual</span>}
              </button>
            )
          })}
        </div>
      )}

      {erro && <p className="text-xs" style={{ color: '#ef4444' }}>{erro}</p>}
    </div>
  )
}
