'use client'
import { BASE_PATH } from '@/lib/base-path'

import { useCallback, useEffect, useRef, useState } from 'react'
import { WhatsappLogo, CheckCircle, WarningCircle, CircleNotch, XCircle, ShieldCheck, X, DeviceMobile } from '@phosphor-icons/react'

/**
 * Botão "Conectar WhatsApp" — Embedded Signup da Meta (fluxo de Tech Provider).
 *
 * Mesmo desenho do app modelo (fbsamples/business-messaging-sample-tech-provider-app,
 * Fbl4bLauncher): FB.login abre o popup da Meta com o config_id; a Meta devolve
 * duas coisas por caminhos diferentes, e só com as duas dá pra concluir:
 *  - o `code` (callback do FB.login) — o servidor troca pelo token;
 *  - a sessão (postMessage WA_EMBEDDED_SIGNUP) — waba_id, phone_number_id, business_id.
 * Elas chegam em qualquer ordem, então cada uma guarda o que recebeu e quem
 * chegar por último dispara o envio pro servidor.
 */

declare global {
  interface Window {
    FB?: any
    fbAsyncInit?: () => void
  }
}

interface ConfigES {
  app_id: string
  sdk_version: string
  es_version: string
  configs: { id: string; name: string }[]
  conectado: { waba_id: string; phone_number_id: string; origem: string; coexistencia?: boolean } | null
}

interface Sessao {
  waba_id?: string
  phone_number_id?: string
  business_id?: string
}

type Passo = { passo: string; ok: boolean; erro?: string }

/**
 * 'normal': o numero migra pra API Oficial (sai do aplicativo do celular).
 * 'coexistencia': numero que ja esta no aplicativo WhatsApp Business continua
 * nele e tambem entra no CRM (featureType whatsapp_business_app_onboarding;
 * a Meta mostra um QR code pra escanear no aplicativo). Ver lib/coexistencia.
 */
type Modo = 'normal' | 'coexistencia'

function carregarSdk(appId: string, versao: string): Promise<void> {
  return new Promise((resolve) => {
    const iniciar = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: versao })
      resolve()
    }
    if (window.FB) return iniciar()
    window.fbAsyncInit = iniciar
    if (!document.getElementById('facebook-jssdk')) {
      const s = document.createElement('script')
      s.id = 'facebook-jssdk'
      s.src = 'https://connect.facebook.net/pt_BR/sdk.js'
      s.async = true
      s.defer = true
      s.crossOrigin = 'anonymous'
      document.body.appendChild(s)
    }
  })
}

export default function WhatsAppEmbeddedSignup({ onConectado }: { onConectado?: () => void }) {
  const [cfg, setCfg] = useState<ConfigES | null>(null)
  const [erroCfg, setErroCfg] = useState<string | null>(null)
  const [configId, setConfigId] = useState('')
  const [sdkPronto, setSdkPronto] = useState(false)
  const [estado, setEstado] = useState<'parado' | 'popup' | 'salvando' | 'feito' | 'erro'>('parado')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [passos, setPassos] = useState<Passo[]>([])
  // Janela 'voce sera direcionado a Meta' antes do popup. O FB.login roda no
  // clique do Continuar com Meta, que tambem e um clique direto: o popup nao e bloqueado.
  // null = janela fechada; senao, qual cadastro o Continuar com Meta abre.
  const [confirmando, setConfirmando] = useState<Modo | null>(null)

  const codigo = useRef<string | null>(null)
  const sessao = useRef<Sessao | null>(null)
  const enviado = useRef(false)
  const modo = useRef<Modo>('normal')

  const carregar = useCallback(async () => {
    setErroCfg(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/embedded-signup`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Não consegui carregar a configuração da Meta.')
      setCfg(j)
      setConfigId((atual) => atual || j.configs?.[0]?.id || '')
      await carregarSdk(j.app_id, j.sdk_version)
      setSdkPronto(true)
    } catch (e: any) {
      setErroCfg(e.message)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const concluir = useCallback(async () => {
    if (enviado.current || !codigo.current || !sessao.current) return
    enviado.current = true
    setEstado('salvando')
    try {
      const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/embedded-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codigo.current, ...sessao.current, modo: modo.current }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'A conexão não foi concluída.')
      setPassos(j.passos || [])
      setEstado('feito')
      setMensagem(null)
      await carregar()
      onConectado?.()
    } catch (e: any) {
      setEstado('erro')
      setMensagem(e.message)
    }
  }, [carregar, onConectado])

  // Sessão do Embedded Signup chega por postMessage da janela da Meta.
  useEffect(() => {
    const ouvir = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return
      let dados: any
      try { dados = typeof event.data === 'string' ? JSON.parse(event.data) : event.data } catch { return }
      if (dados?.type !== 'WA_EMBEDDED_SIGNUP') return
      if (dados.event === 'CANCEL' || dados.data?.current_step) {
        setEstado('parado')
        setMensagem(dados.data?.error_message ? `Conexão cancelada: ${dados.data.error_message}` : 'Conexão cancelada antes de terminar.')
        return
      }
      if (dados.event === 'ERROR') {
        setEstado('erro')
        setMensagem(dados.data?.error_message || 'A Meta informou um erro no cadastro.')
        return
      }
      sessao.current = {
        waba_id: dados.data?.waba_id,
        phone_number_id: dados.data?.phone_number_id,
        business_id: dados.data?.business_id,
      }
      concluir()
    }
    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [concluir])

  const conectar = (qual: Modo) => {
    if (!window.FB || !cfg || !configId) return
    modo.current = qual
    codigo.current = null
    sessao.current = null
    enviado.current = false
    setPassos([])
    setMensagem(null)
    setEstado('popup')
    // FB.login precisa rodar direto no clique, senão o navegador bloqueia o popup.
    window.FB.login(
      (resposta: any) => {
        if (resposta?.authResponse?.code) {
          codigo.current = resposta.authResponse.code
          concluir()
        } else {
          setEstado((e) => (e === 'popup' ? 'parado' : e))
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: '3',
          version: cfg.es_version,
          ...(qual === 'coexistencia' ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
        },
      },
    )
  }

  return (
    <div className="bg-panel border border-line rounded-xl p-6 sm:p-8 mb-8">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#25D366]/15 flex items-center justify-center flex-shrink-0">
          <WhatsappLogo size={26} weight="fill" className="text-[#25D366]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-ink">WhatsApp Business</h2>
          <p className="mt-1 text-sm">
            <span className="text-muted">Status: </span>
            {cfg?.conectado
              ? <span className="font-semibold text-emerald-500">Conectado ✓</span>
              : <span className="font-semibold text-ink">{cfg ? 'Não conectado' : '…'}</span>}
          </p>
          <p className="text-sm text-muted mt-1">
            Conecte sua conta do WhatsApp Business para usar o WhatsApp diretamente pelo CRM. O cadastro é o
            oficial da Meta (Embedded Signup): você escolhe a empresa, a conta e o número, e o CRM recebe o acesso sozinho.
          </p>

          {cfg?.conectado && (
            <p className="mt-3 text-sm text-ink flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Conectado · WABA {cfg.conectado.waba_id} · número {cfg.conectado.phone_number_id}
              <span className="text-muted">({cfg.conectado.coexistencia ? 'coexistência com o aplicativo' : cfg.conectado.origem === 'embedded_signup' ? 'via Conectar WhatsApp' : 'cadastro manual'})</span>
            </p>
          )}

          {erroCfg && (
            <p className="mt-3 text-sm text-red-500 flex items-start gap-2"><WarningCircle size={16} className="mt-0.5 flex-shrink-0" />{erroCfg}</p>
          )}

          {cfg && cfg.configs.length === 0 && (
            <div className="mt-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-ink">
              <p className="font-semibold">Falta criar a configuração de Tech Provider na Meta.</p>
              <p className="text-muted mt-1">
                No painel do app, em <b>Facebook Login for Business → Configurações</b>, crie uma configuração do tipo
                WhatsApp Embedded Signup. Ela aparece aqui sozinha — é só recarregar a página.
              </p>
            </div>
          )}

          {cfg && cfg.configs.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {cfg.configs.length > 1 && (
                <select value={configId} onChange={(e) => setConfigId(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg bg-panel-2 border border-line text-ink">
                  {cfg.configs.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
                </select>
              )}
              <button
                onClick={() => setConfirmando('normal')}
                disabled={!sdkPronto || estado === 'popup' || estado === 'salvando'}
                className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {estado === 'popup' || estado === 'salvando'
                  ? <CircleNotch size={16} className="animate-spin" />
                  : <WhatsappLogo size={16} weight="fill" />}
                {estado === 'salvando' ? 'Concluindo…' : estado === 'popup' ? 'Aguardando a Meta…' : cfg.conectado ? 'Reconectar WhatsApp Business' : 'Conectar WhatsApp Business'}
              </button>
              <button
                onClick={() => setConfirmando('coexistencia')}
                disabled={!sdkPronto || estado === 'popup' || estado === 'salvando'}
                className="btn btn-outline inline-flex items-center gap-2 disabled:opacity-50"
              >
                <DeviceMobile size={16} /> Conectar número do WhatsApp Business (coexistência)
              </button>
              {!sdkPronto && !erroCfg && <span className="text-xs text-muted">Carregando o SDK da Meta…</span>}
            </div>
          )}

          {mensagem && (
            <p className={`mt-3 text-sm flex items-start gap-2 ${estado === 'erro' ? 'text-red-500' : 'text-muted'}`}>
              <WarningCircle size={16} className="mt-0.5 flex-shrink-0" />{mensagem}
            </p>
          )}

          {passos.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {passos.map((p) => (
                <li key={p.passo} className="flex items-start gap-2">
                  {p.ok
                    ? <CheckCircle size={16} weight="fill" className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    : <XCircle size={16} weight="fill" className="text-red-500 mt-0.5 flex-shrink-0" />}
                  <span className="text-ink">{p.passo}{p.erro && <span className="text-muted"> — {p.erro}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirmando && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setConfirmando(null)}>
          <div className="w-full max-w-md rounded-2xl bg-panel border border-line shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-ink">{confirmando === 'coexistencia' ? 'Conectar número do WhatsApp Business' : 'Conectar WhatsApp Business'}</h3>
              <button onClick={() => setConfirmando(null)} className="p-1 rounded-full hover:bg-panel-2" title="Fechar"><X size={16} className="text-muted" /></button>
            </div>
            {confirmando === 'coexistencia' ? (
              <div className="text-sm text-muted mt-3 space-y-2">
                <p>Para o número que você já usa no <b className="text-ink">aplicativo WhatsApp Business</b>: ele continua funcionando no celular e passa a funcionar também no CRM.</p>
                <p>Na janela da Meta, escolha sua empresa e siga até aparecer um <b className="text-ink">QR code</b>. No celular, abra o WhatsApp Business e escaneie o código quando o aplicativo pedir.</p>
                <p>Deixe o celular com o aplicativo atualizado e por perto.</p>
              </div>
            ) : (
              <p className="text-sm text-muted mt-3">
                Você será direcionado ao cadastro seguro da Meta para selecionar sua empresa, a conta do
                WhatsApp Business e o número. Ao autorizar, você volta para o CRM com o WhatsApp conectado.
                O número informado passa a ser usado pela API Oficial e sai do aplicativo do celular.
              </p>
            )}
            <p className="text-xs text-muted mt-3 flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-500" />O CRM nunca vê a sua senha do Facebook.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmando(null)} className="btn btn-outline">Cancelar</button>
              <button onClick={() => { const qual = confirmando; setConfirmando(null); conectar(qual) }} className="btn btn-primary inline-flex items-center gap-2">
                <WhatsappLogo size={16} weight="fill" /> Continuar com Meta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
