'use client'
import { BASE_PATH } from '@/lib/base-path'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowClockwise, X, CheckCircle, WarningCircle, Clock, PauseCircle } from '@phosphor-icons/react'
import { useAtualizacaoPeriodica } from '@/hooks/useAtualizacaoPeriodica'

/**
 * Eventos que a Meta mandou pro webhook desta conta (meta_webhook_events):
 * Meta → webhook → backend → CRM. Cada linha diz o que chegou e o que o CRM
 * fez com aquilo; o detalhe mostra os campos e o JSON original da Meta.
 */

interface Evento {
  id: string
  receivedAt: string
  object: string | null
  payload: any
  status: string
  processedAt: string | null
  error: string | null
}

interface Linha {
  tipo: string
  numero: string | null
  texto: string | null
  waba: string | null
}

/** Traduz o payload da Meta num evento legível (o primeiro change do lote). */
function ler(p: any): Linha {
  const entry = p?.entry?.[0]
  const change = entry?.changes?.[0]
  const v = change?.value || {}
  const waba = entry?.id || null
  if (v.messages?.length) {
    const m = v.messages[0]
    return { tipo: 'message.received', numero: m.from || null, texto: m.text?.body || m[m.type]?.caption || `[${m.type}]`, waba }
  }
  if (v.statuses?.length) {
    const s = v.statuses[0]
    const erro = s.errors?.[0]?.title
    return { tipo: `message.${s.status}`, numero: s.recipient_id || null, texto: erro ? `Erro: ${erro}` : null, waba }
  }
  // Coexistência (número também no aplicativo WhatsApp Business).
  if (change?.field === 'smb_message_echoes') {
    const m = v.message_echoes?.[0]
    return { tipo: 'message.echo', numero: m?.to || null, texto: `Enviada pelo celular: ${m?.text?.body || `[${m?.type || 'mensagem'}]`}`, waba }
  }
  if (change?.field === 'history') {
    const conversas = (v.history || []).reduce((n: number, h: any) => n + (h.threads?.length || 0), 0)
    const fase = v.history?.[0]?.metadata
    return { tipo: 'history.sync', numero: null, texto: `Histórico do aplicativo: ${conversas} conversa(s)${fase?.progress != null ? ` · ${fase.progress}%` : ''}`, waba }
  }
  if (change?.field === 'smb_app_state_sync') {
    return { tipo: 'contacts.sync', numero: null, texto: `Contatos do aplicativo: ${(v.state_sync || []).length}`, waba }
  }
  if (change?.field === 'message_template_status_update') {
    return { tipo: 'template.status', numero: null, texto: `${v.message_template_name || 'modelo'} → ${v.event || '?'}${v.reason && v.reason !== 'NONE' ? ` (${v.reason})` : ''}`, waba }
  }
  if (entry?.messaging?.length) return { tipo: 'instagram.message', numero: entry.messaging[0]?.sender?.id || null, texto: entry.messaging[0]?.message?.text || null, waba }
  return { tipo: change?.field || p?.object || 'evento', numero: v.display_phone_number || null, texto: null, waba }
}

const STATUS: Record<string, { rotulo: string; cor: string; icone: any }> = {
  processado: { rotulo: 'Processado', cor: 'text-emerald-500', icone: CheckCircle },
  erro: { rotulo: 'Erro', cor: 'text-red-500', icone: WarningCircle },
  pendente: { rotulo: 'Processando', cor: 'text-amber-500', icone: Clock },
  pausado: { rotulo: 'Pausado', cor: 'text-muted', icone: PauseCircle },
}

const formatarNumero = (n: string | null) => {
  if (!n) return '—'
  const d = n.replace(/\D/g, '')
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${d}`
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState<Evento | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/webhook-events?limite=100`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Não consegui carregar os eventos.')
      setEventos(j.eventos || [])
      setErro(null)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])
  // Evento novo aparece sozinho, sem recarregar a página.
  useAtualizacaoPeriodica(carregar, 5000)

  const linhas = useMemo(() => eventos.map((e) => ({ e, l: ler(e.payload) })), [eventos])
  const detalhe = aberto ? ler(aberto.payload) : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-ink">Eventos da integração</h2>
          <p className="text-sm text-muted">
            O que a Meta enviou para o webhook desta conta e o que o CRM fez com cada evento.
            {eventos[0] && <> Último evento: <b className="text-ink">{quando(eventos[0].receivedAt)}</b>.</>}
          </p>
        </div>
        <button onClick={() => { setCarregando(true); carregar() }} className="btn btn-outline inline-flex items-center gap-2">
          <ArrowClockwise size={16} className={carregando ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {erro && <p className="mb-4 text-sm text-red-500">{erro}</p>}

      <div className="bg-panel border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-line">
              <th className="px-4 py-3 font-semibold">Data/hora</th>
              <th className="px-4 py-3 font-semibold">Evento</th>
              <th className="px-4 py-3 font-semibold hidden sm:table-cell">Número</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ e, l }) => {
              const st = STATUS[e.status] || STATUS.pausado
              const Icone = st.icone
              return (
                <tr key={e.id} onClick={() => setAberto(e)} className="border-b border-line last:border-0 cursor-pointer hover:bg-panel-2 transition-colors">
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{quando(e.receivedAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-ink">{l.tipo}</p>
                    {l.texto && <p className="text-xs text-muted truncate max-w-xs">{l.texto}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink hidden sm:table-cell whitespace-nowrap">{formatarNumero(l.numero)}</td>
                  <td className={`px-4 py-3 font-semibold ${st.cor}`}><span className="inline-flex items-center gap-1.5"><Icone size={16} weight="fill" />{st.rotulo}</span></td>
                </tr>
              )
            })}
            {!carregando && linhas.length === 0 && !erro && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Nenhum evento recebido desta conta ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {aberto && detalhe && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setAberto(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-panel border border-line shadow-2xl" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h3 className="text-lg font-bold text-ink">Detalhes do evento</h3>
              <button onClick={() => setAberto(null)} className="p-1.5 rounded-full hover:bg-panel-2" title="Fechar"><X size={16} className="text-muted" /></button>
            </div>
            <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-3 px-6 py-5 text-sm">
              <dt className="text-muted">Tipo</dt><dd className="font-mono text-ink">{detalhe.tipo}</dd>
              <dt className="text-muted">WhatsApp Business Account</dt><dd className="text-ink">{detalhe.waba ? `WABA ${detalhe.waba}` : '—'}</dd>
              <dt className="text-muted">Telefone</dt><dd className="text-ink">{formatarNumero(detalhe.numero)}</dd>
              <dt className="text-muted">Mensagem</dt><dd className="text-ink whitespace-pre-wrap">{detalhe.texto || '—'}</dd>
              <dt className="text-muted">Recebido em</dt><dd className="text-ink">{new Date(aberto.receivedAt).toLocaleString('pt-BR')}</dd>
              <dt className="text-muted">Status</dt>
              <dd className={`font-semibold ${(STATUS[aberto.status] || STATUS.pausado).cor}`}>
                {(STATUS[aberto.status] || STATUS.pausado).rotulo}{aberto.status === 'processado' ? ' ✓' : ''}
              </dd>
              {aberto.error && (<><dt className="text-muted">Resultado</dt><dd className="text-ink">{aberto.error}</dd></>)}
            </dl>
            <div className="px-6 pb-6">
              <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2">JSON recebido da Meta</p>
              <pre className="text-[11px] leading-relaxed text-ink bg-panel-2 border border-line rounded-lg p-3 overflow-x-auto max-h-72">
                {JSON.stringify(aberto.payload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
