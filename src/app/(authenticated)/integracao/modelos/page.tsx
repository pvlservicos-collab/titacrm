'use client'
import { BASE_PATH } from '@/lib/base-path'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ArrowClockwise, Trash, X, CircleNotch, WarningCircle, CheckCircle, PaperPlaneTilt } from '@phosphor-icons/react'

/**
 * Modelos de mensagem (templates) da conta do WhatsApp: lista direto da Meta e
 * cria modelo novo, que vai pra análise. Servidor: api/integrations/whatsapp-cloud/message-templates.
 */

interface Modelo {
  id: string
  name: string
  category: string
  language: string
  status: string
  rejected_reason?: string
  components?: any[]
}

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  APPROVED: { rotulo: 'Aprovado', cor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
  PENDING: { rotulo: 'Em análise', cor: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
  IN_APPEAL: { rotulo: 'Em recurso', cor: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
  REJECTED: { rotulo: 'Rejeitado', cor: 'text-red-500 bg-red-500/10 border-red-500/30' },
  PAUSED: { rotulo: 'Pausado', cor: 'text-muted bg-panel-2 border-line' },
  DISABLED: { rotulo: 'Desativado', cor: 'text-muted bg-panel-2 border-line' },
  QUALITY_PENDING: { rotulo: 'Aprovado (qualidade em análise)', cor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
}

const CATEGORIA: Record<string, string> = { UTILITY: 'Utilidade', MARKETING: 'Marketing', AUTHENTICATION: 'Autenticação' }
const IDIOMAS = [
  { v: 'pt_BR', r: 'Português (Brasil)' },
  { v: 'en_US', r: 'Inglês (EUA)' },
  { v: 'es', r: 'Espanhol' },
  { v: 'pt_PT', r: 'Português (Portugal)' },
]

const variaveis = (texto: string) =>
  [...new Set((texto.match(/\{\{\s*(\d+)\s*\}\}/g) || []).map((v) => Number(v.replace(/\D/g, ''))))].sort((a, b) => a - b)

const preencher = (texto: string, valores: string[]) =>
  texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => valores[Number(n) - 1]?.trim() || m)

const VAZIO = { name: '', category: 'UTILITY', language: 'pt_BR', temCabecalho: false, header: '', headerExample: '', body: '', footer: '', examples: [] as string[], buttons: [] as string[] }

export default function ModelosPage() {
  const [modelos, setModelos] = useState<Modelo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState(VAZIO)
  const [enviando, setEnviando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/message-templates`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Não consegui buscar os modelos na Meta.')
      setModelos(j.modelos || [])
      setErro(null)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const varsCorpo = useMemo(() => variaveis(form.body), [form.body])
  const varsCabecalho = useMemo(() => (form.temCabecalho ? variaveis(form.header) : []), [form.temCabecalho, form.header])
  const set = (campo: Partial<typeof VAZIO>) => setForm((f) => ({ ...f, ...campo }))

  const enviar = async () => {
    setEnviando(true)
    setErroForm(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/message-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          language: form.language,
          header: form.temCabecalho ? form.header : '',
          header_example: form.headerExample,
          body: form.body,
          footer: form.footer,
          examples: varsCorpo.map((n) => form.examples[n - 1] || ''),
          buttons: form.buttons,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'A Meta recusou o modelo.')
      setCriando(false)
      setForm(VAZIO)
      setAviso(`Modelo "${form.name}" enviado para análise da Meta${j.status ? ` — status: ${STATUS[j.status]?.rotulo || j.status}` : ''}.`)
      await carregar()
    } catch (e: any) {
      setErroForm(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const excluir = async (m: Modelo) => {
    if (!window.confirm(`Excluir o modelo "${m.name}"? Ele some da conta do WhatsApp em todos os idiomas.`)) return
    const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/message-templates?name=${encodeURIComponent(m.name)}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    setAviso(res.ok ? `Modelo "${m.name}" excluído.` : j.error || 'Não consegui excluir.')
    await carregar()
  }

  const campo = 'w-full px-3 py-2 text-sm rounded-lg bg-panel-2 border border-line text-ink placeholder:text-muted focus:outline-none focus:border-accent'
  const rotulo = 'block text-xs font-bold uppercase tracking-wider text-muted mb-1.5'
  const textoDe = (m: Modelo, tipo: string) => m.components?.find((c) => c.type === tipo)?.text || ''

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-ink">Modelos de mensagem</h2>
          <p className="text-sm text-muted">Mensagens aprovadas pela Meta para iniciar conversas fora da janela de 24h.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={carregar} disabled={carregando} className="btn btn-outline inline-flex items-center gap-2">
            <ArrowClockwise size={16} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button onClick={() => { setCriando(true); setErroForm(null) }} className="btn btn-primary inline-flex items-center gap-2">
            <Plus size={16} weight="bold" /> Criar modelo
          </button>
        </div>
      </div>

      {aviso && (
        <p className="mb-4 text-sm text-ink bg-panel-2 border border-line rounded-lg px-3 py-2 flex items-center gap-2">
          <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />{aviso}
        </p>
      )}
      {erro && <p className="mb-4 text-sm text-red-500 flex items-start gap-2"><WarningCircle size={16} className="mt-0.5 flex-shrink-0" />{erro}</p>}

      <div className="bg-panel border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-line">
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Categoria</th>
              <th className="px-4 py-3 font-semibold hidden sm:table-cell">Idioma</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {modelos?.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0 align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{m.name}</p>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2 max-w-md">{textoDe(m, 'BODY')}</p>
                  {m.status === 'REJECTED' && m.rejected_reason && m.rejected_reason !== 'NONE' && (
                    <p className="text-xs text-red-500 mt-1">Motivo: {m.rejected_reason}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-ink">{CATEGORIA[m.category] || m.category}</td>
                <td className="px-4 py-3 text-muted hidden sm:table-cell">{m.language}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS[m.status]?.cor || 'text-muted border-line'}`}>
                    {STATUS[m.status]?.rotulo || m.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => excluir(m)} title="Excluir modelo" className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-500">
                    <Trash size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {modelos && modelos.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhum modelo nesta conta ainda.</td></tr>
            )}
            {!modelos && !erro && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted"><CircleNotch size={18} className="inline animate-spin mr-2" />Buscando modelos na Meta…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {criando && (
        <div className="fixed inset-0 z-[999] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => !enviando && setCriando(false)}>
          <div className="w-full max-w-4xl rounded-2xl bg-panel border border-line shadow-2xl my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h3 className="text-lg font-bold text-ink">Criar modelo de mensagem</h3>
              <button onClick={() => setCriando(false)} className="p-1.5 rounded-full hover:bg-panel-2" title="Fechar"><X size={16} className="text-muted" /></button>
            </div>

            <div className="grid md:grid-cols-[1fr_300px] gap-6 p-6">
              <div className="space-y-4">
                <div>
                  <label className={rotulo}>Nome</label>
                  <input className={campo} value={form.name} placeholder="confirmacao_agenda"
                    onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
                  <p className="text-xs text-muted mt-1">Só letras minúsculas, números e _.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={rotulo}>Categoria</label>
                    <select className={campo} value={form.category} onChange={(e) => set({ category: e.target.value })}>
                      <option value="UTILITY">Utilidade (confirmações, avisos)</option>
                      <option value="MARKETING">Marketing (ofertas, novidades)</option>
                    </select>
                  </div>
                  <div>
                    <label className={rotulo}>Idioma</label>
                    <select className={campo} value={form.language} onChange={(e) => set({ language: e.target.value })}>
                      {IDIOMAS.map((i) => <option key={i.v} value={i.v}>{i.r}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={rotulo}>Cabeçalho</label>
                  <select className={campo} value={form.temCabecalho ? 'TEXT' : 'NONE'} onChange={(e) => set({ temCabecalho: e.target.value === 'TEXT' })}>
                    <option value="NONE">Nenhum</option>
                    <option value="TEXT">Texto</option>
                  </select>
                  {form.temCabecalho && (
                    <input className={`${campo} mt-2`} maxLength={60} value={form.header} placeholder="Visita confirmada" onChange={(e) => set({ header: e.target.value })} />
                  )}
                  {varsCabecalho.length > 0 && (
                    <input className={`${campo} mt-2`} value={form.headerExample} placeholder="Exemplo para {{1}} do cabeçalho" onChange={(e) => set({ headerExample: e.target.value })} />
                  )}
                </div>
                <div>
                  <label className={rotulo}>Corpo</label>
                  <textarea className={`${campo} min-h-[110px]`} maxLength={1024} value={form.body}
                    placeholder="Olá {{1}}, sua visita está confirmada para {{2}} às {{3}}. Qualquer dúvida, é só responder."
                    onChange={(e) => set({ body: e.target.value })} />
                  <div className="flex items-center justify-between mt-1">
                    <button type="button" className="text-xs font-semibold text-accent hover:underline"
                      onClick={() => set({ body: `${form.body}${form.body && !form.body.endsWith(' ') ? ' ' : ''}{{${(varsCorpo[varsCorpo.length - 1] || 0) + 1}}}` })}>
                      + Adicionar variável
                    </button>
                    <span className="text-xs text-muted">{form.body.length}/1024</span>
                  </div>
                </div>
                {varsCorpo.length > 0 && (
                  <div>
                    <label className={rotulo}>Variáveis (exemplo para a análise da Meta)</label>
                    <div className="space-y-2">
                      {varsCorpo.map((n) => (
                        <div key={n} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted w-10">{`{{${n}}}`}</span>
                          <input className={campo} value={form.examples[n - 1] || ''} placeholder={n === 1 ? 'Maria' : n === 2 ? '25/09' : '14h'}
                            onChange={(e) => setForm((f) => { const ex = [...f.examples]; ex[n - 1] = e.target.value; return { ...f, examples: ex } })} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className={rotulo}>Rodapé (opcional)</label>
                  <input className={campo} maxLength={60} value={form.footer} placeholder="PVL Serviços" onChange={(e) => set({ footer: e.target.value })} />
                </div>
                <div>
                  <label className={rotulo}>Botões de resposta rápida (opcional, até 3)</label>
                  <div className="space-y-2">
                    {form.buttons.map((b, i) => (
                      <div key={i} className="flex gap-2">
                        <input className={campo} maxLength={25} value={b} placeholder="Confirmar"
                          onChange={(e) => setForm((f) => ({ ...f, buttons: f.buttons.map((x, j) => (j === i ? e.target.value : x)) }))} />
                        <button type="button" onClick={() => setForm((f) => ({ ...f, buttons: f.buttons.filter((_, j) => j !== i) }))} className="p-2 rounded-lg hover:bg-panel-2 text-muted"><X size={14} /></button>
                      </div>
                    ))}
                    {form.buttons.length < 3 && (
                      <button type="button" onClick={() => setForm((f) => ({ ...f, buttons: [...f.buttons, ''] }))} className="text-xs font-semibold text-accent hover:underline">+ Adicionar botão</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Prévia */}
              <div>
                <p className={rotulo}>Prévia</p>
                <div className="rounded-xl p-4 border border-line" style={{ backgroundColor: 'var(--chat-bg-conversation)' }}>
                  <div className="rounded-2xl rounded-tl-[2px] px-3 py-2 text-sm whitespace-pre-wrap shadow-sm"
                    style={{ backgroundColor: 'var(--chat-bg-field)', color: 'var(--chat-text-primary)' }}>
                    {form.temCabecalho && form.header && <p className="font-bold mb-1">{preencher(form.header, [form.headerExample])}</p>}
                    <p>{form.body ? preencher(form.body, form.examples) : <span className="text-muted">O corpo da mensagem aparece aqui.</span>}</p>
                    {form.footer && <p className="mt-1.5 text-[11px] opacity-60">{form.footer}</p>}
                  </div>
                  {form.buttons.filter(Boolean).map((b, i) => (
                    <div key={i} className="mt-1 rounded-xl py-1.5 text-center text-sm font-semibold text-accent" style={{ backgroundColor: 'var(--chat-bg-field)' }}>{b}</div>
                  ))}
                </div>
              </div>
            </div>

            {erroForm && <p className="px-6 -mt-2 mb-3 text-sm text-red-500 flex items-start gap-2"><WarningCircle size={16} className="mt-0.5 flex-shrink-0" />{erroForm}</p>}

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
              <button onClick={() => setCriando(false)} disabled={enviando} className="btn btn-outline">Cancelar</button>
              <button onClick={enviar} disabled={enviando || !form.name || !form.body} className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                {enviando ? <CircleNotch size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} weight="fill" />}
                {enviando ? 'Enviando…' : 'Enviar para análise'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
