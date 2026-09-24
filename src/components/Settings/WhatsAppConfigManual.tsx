'use client'

/**
 * Configuração da API Oficial colando as credenciais à mão.
 *
 * O botão "Conectar WhatsApp Business" (Embedded Signup) é o caminho bonito,
 * mas só funciona com o app da Meta aprovado e a configuração de login criada.
 * Quem já tem as credenciais na mão — WABA, número e token de usuário do
 * sistema — não precisa passar por lá: cola aqui e a integração fica pronta.
 *
 * A tela mostra também o que está faltando fora do CRM (variáveis na Vercel,
 * webhook no painel da Meta), porque "não chega mensagem" tem sempre a mesma
 * cara e três causas diferentes. Nenhum segredo volta pro navegador: o
 * diagnóstico diz só se cada peça está preenchida.
 */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, WarningCircle, Copy, ArrowClockwise } from '@phosphor-icons/react'
import { BASE_PATH } from '@/lib/base-path'

interface Diagnostico {
  webhook: {
    url: string
    campos: string[]
    camposCoexistencia: string[]
    ativo: boolean
    ultimoEvento: { recebidoEm: string; status: string; objeto: string | null; erro: string | null } | null
    totalEventos: number
  }
  variaveis: Record<string, boolean | string>
  credenciais: { salvas: boolean; waba_id: string | null; phone_number_id: string | null; temToken: boolean }
  numero: { display: string | null; nome: string | null; qualidade: string | null } | null
  erroNumero: string | null
  templates: { total: number; aprovados: number } | null
  erroTemplates: string | null
}

function Peca({ ok, titulo, detalhe }: { ok: boolean; titulo: string; detalhe?: string | null }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle size={18} weight="fill" className="text-emerald-400 flex-shrink-0 mt-0.5" />
      ) : (
        <WarningCircle size={18} weight="fill" className="text-amber-400 flex-shrink-0 mt-0.5" />
      )}
      <span className="min-w-0">
        <span className="text-ink">{titulo}</span>
        {detalhe && <span className="block text-xs text-muted break-words">{detalhe}</span>}
      </span>
    </li>
  )
}

export default function WhatsAppConfigManual({ onSalvo }: { onSalvo?: () => void }) {
  const [diag, setDiag] = useState<Diagnostico | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [recado, setRecado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const [waba, setWaba] = useState('')
  const [numero, setNumero] = useState('')
  const [token, setToken] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/diagnostico`)
      const dados = await res.json()
      if (res.ok) {
        setDiag(dados)
        setWaba((atual) => atual || dados?.credenciais?.waba_id || '')
        setNumero((atual) => atual || dados?.credenciais?.phone_number_id || '')
      }
    } catch {
      /* rede: a tela mostra o que já tinha */
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const salvar = async () => {
    setSalvando(true)
    setRecado(null)
    try {
      const corpo: Record<string, string> = { phone_number_id: numero.trim() }
      if (waba.trim()) corpo.waba_id = waba.trim()
      // Token em branco = manter o que já está salvo (a tela nunca mostra o atual).
      if (token.trim()) corpo.system_token = token.trim()
      if (!corpo.system_token && !diag?.credenciais?.temToken) {
        throw new Error('Cole o token de acesso permanente.')
      }
      const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const dados = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(dados?.error || 'Falha ao salvar.')
      setToken('')
      setRecado({ tipo: 'ok', texto: 'Credenciais salvas. Conferindo com a Meta…' })
      await carregar()
      if (onSalvo) onSalvo()
    } catch (err: any) {
      setRecado({ tipo: 'erro', texto: err?.message || 'Falha ao salvar.' })
    } finally {
      setSalvando(false)
    }
  }

  const copiarWebhook = async () => {
    if (!diag?.webhook?.url) return
    try {
      await navigator.clipboard.writeText(diag.webhook.url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch { /* sem área de transferência: dá pra selecionar o texto */ }
  }

  const v = diag?.variaveis || {}

  return (
    <div className="bg-panel border rounded-xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-ink">Colar credenciais da API Oficial</h2>
          <p className="text-sm text-muted mt-1">
            Para quem já tem a conta criada na Meta. Os três dados ficam em
            developers.facebook.com → seu app → WhatsApp → Configuração da API.
          </p>
        </div>
        <button onClick={carregar} disabled={carregando} className="btn btn-outline btn-sm flex-shrink-0">
          <ArrowClockwise size={14} weight="bold" /> {carregando ? 'Conferindo…' : 'Conferir'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            ID da conta do WhatsApp Business (WABA) — só para templates
          </label>
          <input
            value={waba}
            onChange={(e) => setWaba(e.target.value)}
            placeholder="Ex: 123456789012345"
            className="field w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            ID do número de telefone
          </label>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Ex: 987654321098765"
            className="field w-full"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            Token de acesso permanente (usuário do sistema)
          </label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            placeholder={diag?.credenciais?.temToken ? '••••••••  (deixe em branco para manter o atual)' : 'EAAG...'}
            className="field w-full"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={salvar} disabled={salvando || !numero.trim()} className="btn btn-primary btn-sm disabled:opacity-40">
          {salvando ? 'Salvando…' : 'Salvar e testar'}
        </button>
        {recado && (
          <span className={`text-sm ${recado.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{recado.texto}</span>
        )}
      </div>

      {/* Webhook: o que colar no painel da Meta */}
      <div className="border-t pt-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Webhook (cole no painel da Meta)</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-panel-2 rounded-lg px-3 py-2 break-all">{diag?.webhook?.url || '—'}</code>
          <button onClick={copiarWebhook} className="btn btn-outline btn-sm flex-shrink-0">
            <Copy size={14} weight="bold" /> {copiado ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        <p className="text-xs text-muted mt-2">
          Campos a assinar: <strong>{(diag?.webhook?.campos || []).join(', ')}</strong>. Para coexistência
          (manter o número no celular), assine também {(diag?.webhook?.camposCoexistencia || []).join(', ')}.
          O <em>Verify token</em> é o valor da variável FACEBOOK_WEBHOOK_VERIFY_TOKEN.
        </p>
      </div>

      {/* Diagnóstico */}
      <div className="border-t pt-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">O que já está pronto</p>
        <ul className="space-y-2">
          <Peca
            ok={!!diag?.credenciais?.salvas && !!diag?.credenciais?.temToken}
            titulo="Credenciais salvas no CRM"
            detalhe={diag?.credenciais?.salvas
              ? `WABA ${diag.credenciais.waba_id || '—'} · número ${diag.credenciais.phone_number_id || '—'}`
              : 'Cole os três campos acima'}
          />
          <Peca
            ok={!!diag?.numero}
            titulo="Número respondendo na Meta"
            detalhe={diag?.numero
              ? `${diag.numero.display || ''} ${diag.numero.nome ? '· ' + diag.numero.nome : ''} ${diag.numero.qualidade ? '· qualidade ' + diag.numero.qualidade : ''}`
              : diag?.erroNumero || 'Sem resposta da Meta'}
          />
          <Peca
            ok={!!diag?.templates && diag.templates.aprovados > 0}
            titulo="Templates aprovados"
            detalhe={diag?.templates
              ? `${diag.templates.aprovados} aprovado(s) de ${diag.templates.total}`
              : diag?.erroTemplates || 'Não deu pra listar'}
          />
          <Peca
            ok={!!v.FACEBOOK_WEBHOOK_VERIFY_TOKEN}
            titulo="Variável FACEBOOK_WEBHOOK_VERIFY_TOKEN"
            detalhe={v.FACEBOOK_WEBHOOK_VERIFY_TOKEN ? 'Preenchida' : 'Falta na Vercel — sem ela a Meta não valida o webhook'}
          />
          <Peca
            ok={!!v.FACEBOOK_APP_SECRET}
            titulo="Variável FACEBOOK_APP_SECRET"
            detalhe={v.FACEBOOK_APP_SECRET
              ? 'Preenchida — a assinatura de cada webhook é conferida'
              : 'Falta na Vercel — o webhook aceita sem conferir a assinatura (funciona, mas fica aberto)'}
          />
          <Peca
            ok={!!v.FB_APP_ID && !!v.FB_ES_CONFIG_ID}
            titulo="Conectar pelo botão da Meta (Embedded Signup)"
            detalhe={v.FB_APP_ID && v.FB_ES_CONFIG_ID
              ? 'Pronto'
              : 'Faltam FB_APP_ID e FB_ES_CONFIG_ID — só é preciso para conectar pelo botão; colando as credenciais acima não precisa'}
          />
          <Peca
            ok={(diag?.webhook?.totalEventos ?? 0) > 0}
            titulo="Webhook recebendo eventos da Meta"
            detalhe={diag?.webhook?.ultimoEvento
              ? `Último: ${new Date(diag.webhook.ultimoEvento.recebidoEm).toLocaleString('pt-BR')} · ${diag.webhook.ultimoEvento.status}${diag.webhook.ultimoEvento.erro ? ' · ' + diag.webhook.ultimoEvento.erro : ''} (${diag.webhook.totalEventos} no total)`
              : 'Nenhum evento ainda — mande "oi" do seu celular para o número conectado'}
          />
        </ul>
      </div>
    </div>
  )
}
