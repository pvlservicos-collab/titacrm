'use client'
import { BASE_PATH } from '@/lib/base-path'

import { useEffect, useMemo, useState } from 'react'
import { X, PaperPlaneRight, CircleNotch, WarningCircle } from '@phosphor-icons/react'

/**
 * Painel "Enviar template" do chat (API Oficial). Fica entre a conversa e o
 * campo de digitar: escolhe o template, mostra a prévia exatamente como vai
 * chegar (com as variáveis preenchidas ao vivo) e envia pelo botão de baixo.
 * Quem monta o texto final e grava na conversa é o servidor
 * (api/leads/[id]/template).
 */

interface TemplateResumo {
  name: string
  language: string
  category: string
  header: string | null
  body: string
  footer: string | null
  buttons: string[]
  bodyParams: number
  headerParams: number
}

interface TemplatePanelProps {
  leadId: string
  leadName: string
  onClose: () => void
  onSent: (content: string) => void | Promise<void>
}

const preencher = (texto: string, valores: string[]) =>
  texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (marca, n) => valores[Number(n) - 1]?.trim() || marca)

export default function TemplatePanel({ leadId, leadName, onClose, onSent }: TemplatePanelProps) {
  const [templates, setTemplates] = useState<TemplateResumo[] | null>(null)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const [escolhido, setEscolhido] = useState('')
  const [valores, setValores] = useState<string[]>([])
  const [valoresCabecalho, setValoresCabecalho] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [semPagamento, setSemPagamento] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/templates`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({}))
        if (!vivo) return
        if (!res.ok) throw new Error(j.error || 'Não consegui carregar os templates.')
        const lista: TemplateResumo[] = j.templates || []
        setTemplates(lista)
        setSemPagamento(j.pagamento === false)
        if (lista[0]) setEscolhido(`${lista[0].name}|${lista[0].language}`)
      })
      .catch((e) => vivo && setErroLista(e.message))
    return () => { vivo = false }
  }, [])

  const template = useMemo(
    () => templates?.find((t) => `${t.name}|${t.language}` === escolhido) || null,
    [templates, escolhido],
  )

  // Trocou de template: zera as variáveis e já sugere o nome do contato na
  // primeira, que quase sempre é "Olá {{1}}".
  useEffect(() => {
    if (!template) return
    setValores(Array.from({ length: template.bodyParams }, (_, i) => (i === 0 ? leadName : '')))
    setValoresCabecalho(Array.from({ length: template.headerParams }, () => ''))
    setErroEnvio(null)
  }, [template, leadName])

  const completo = !!template
    && valores.slice(0, template.bodyParams).every((v) => v.trim())
    && valoresCabecalho.slice(0, template.headerParams).every((v) => v.trim())

  const enviar = async () => {
    if (!template || !completo || enviando) return
    setEnviando(true)
    setErroEnvio(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/leads/${leadId}/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: template.name, language: template.language, params: valores, header_params: valoresCabecalho }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'A Meta recusou o envio.')
      await onSent(j.content || '')
      onClose()
    } catch (e: any) {
      setErroEnvio(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const campo = 'w-full px-3 py-2 text-sm rounded-lg bg-[var(--chat-bg-field)] border border-[var(--chat-border)] text-[var(--chat-text-primary)] placeholder-[var(--chat-text-muted)] focus:outline-none focus:border-accent'

  return (
    <div className="mx-3 mb-2 rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-bg-panel)] shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--chat-border)]">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--chat-text-secondary)]">Enviar template · API Oficial</span>
        <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--chat-bg-hover)]" title="Fechar">
          <X size={14} weight="bold" className="text-[var(--chat-icon)]" />
        </button>
      </div>

      <div className="p-4 space-y-3 max-h-[46vh] overflow-y-auto">
        {erroLista && (
          <p className="flex items-start gap-2 text-sm text-red-500"><WarningCircle size={18} className="flex-shrink-0 mt-0.5" />{erroLista}</p>
        )}
        {!templates && !erroLista && (
          <p className="flex items-center gap-2 text-sm text-[var(--chat-text-muted)]"><CircleNotch size={16} className="animate-spin" />Carregando templates da Meta…</p>
        )}
        {semPagamento && (
          <p className="flex items-start gap-2 text-xs text-amber-500"><WarningCircle size={16} className="flex-shrink-0 mt-0.5" />A conta do WhatsApp está sem forma de pagamento. Templates de marketing e utilidade podem ser recusados — cadastre um cartão no Gerenciador do WhatsApp.</p>
        )}
        {templates && templates.length === 0 && (
          <p className="text-sm text-[var(--chat-text-muted)]">Nenhum template aprovado que dê para enviar pelo chat.</p>
        )}

        {templates && templates.length > 0 && (
          <>
            <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className={campo}>
              {templates.map((t) => (
                <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                  {t.name} · {t.language}
                </option>
              ))}
            </select>

            {template && (
              <>
                {/* Prévia: igual à bolha de mensagem enviada */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-[2px] px-3 py-2 text-sm whitespace-pre-wrap shadow-sm"
                    style={{ backgroundColor: 'var(--chat-bubble-out)', color: 'var(--chat-bubble-out-ink)' }}>
                    {template.header && <p className="font-bold mb-1">{preencher(template.header, valoresCabecalho)}</p>}
                    <p>{preencher(template.body, valores)}</p>
                    {template.footer && <p className="mt-1.5 text-[11px] opacity-70">{template.footer}</p>}
                    {template.buttons.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/15 flex flex-col gap-1">
                        {template.buttons.map((b) => <span key={b} className="text-center text-xs font-semibold opacity-90">{b}</span>)}
                      </div>
                    )}
                  </div>
                </div>

                {(template.headerParams > 0 || template.bodyParams > 0) && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {valoresCabecalho.map((v, i) => (
                      <input key={`h${i}`} value={v} placeholder={`Cabeçalho {{${i + 1}}}`} className={campo}
                        onChange={(e) => setValoresCabecalho((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
                    ))}
                    {valores.map((v, i) => (
                      <input key={`b${i}`} value={v} placeholder={`Variável {{${i + 1}}}`} className={campo}
                        onChange={(e) => setValores((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {erroEnvio && (
          <p className="flex items-start gap-2 text-sm text-red-500"><WarningCircle size={18} className="flex-shrink-0 mt-0.5" />{erroEnvio}</p>
        )}
      </div>

      <div className="px-4 pb-3">
        <button
          onClick={enviar}
          disabled={!completo || enviando}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-[#04121c] bg-accent hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {enviando ? <CircleNotch size={16} className="animate-spin" /> : <PaperPlaneRight size={16} weight="fill" />}
          {enviando ? 'Enviando…' : 'Enviar para este contato'}
        </button>
      </div>
    </div>
  )
}
