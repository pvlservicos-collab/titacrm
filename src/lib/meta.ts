/**
 * Graph API da Meta pro fluxo de Tech Provider (WhatsApp Business Platform).
 *
 * Espelha o app modelo da Meta (fbsamples/business-messaging-sample-tech-provider-app):
 * Embedded Signup -> troca do código por token -> inscrever o app na WABA ->
 * registrar o número. Tudo que fala com a Graph API por aqui usa a mesma
 * versão (FB_GRAPH_API_VERSION) e devolve o erro da Meta com a mensagem dela.
 *
 * Variáveis: FB_APP_ID, FACEBOOK_APP_SECRET, FB_GRAPH_API_VERSION, FB_REG_PIN,
 * FB_ES_VERSION (versão do Embedded Signup, padrão v3).
 */

export const GRAPH_VERSION = process.env.FB_GRAPH_API_VERSION || 'v25.0'
const GRAPH = 'https://graph.facebook.com'

export class ErroMeta extends Error {
  status: number
  codigo?: number
  constructor(message: string, status = 502, codigo?: number) {
    super(message)
    this.status = status
    this.codigo = codigo
  }
}

function mensagemDaMeta(j: any, fallback: string): ErroMeta {
  const e = j?.error
  if (!e) return new ErroMeta(fallback)
  const detalhe = e.error_user_msg || e.error_data?.details || e.message || fallback
  const dica =
    e.code === 190 ? ' (o token de acesso expirou ou foi revogado)'
      : e.code === 4 || e.error_subcode === 2388093 ? ' (muitas tentativas: espere um pouco e tente de novo)'
        : ''
  return new ErroMeta(`${detalhe}${dica}`, e.code === 4 ? 429 : 502, e.code)
}

export async function graphGet(caminho: string, token: string): Promise<any> {
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j?.error) throw mensagemDaMeta(j, `Falha na Graph API (${caminho.split('?')[0]}).`)
  return j
}

export async function graphPost(caminho: string, token: string, corpo: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}${caminho}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j?.error) throw mensagemDaMeta(j, `Falha na Graph API (${caminho.split('?')[0]}).`)
  return j
}

/** ID do app e token de app (app_id|app_secret). Sem eles o Embedded Signup não existe. */
export function credenciaisDoApp() {
  const appId = process.env.FB_APP_ID
  const segredo = process.env.FACEBOOK_APP_SECRET
  if (!appId || !segredo) throw new ErroMeta('FB_APP_ID ou FACEBOOK_APP_SECRET não configurados.', 500)
  return { appId, tokenDoApp: `${appId}|${segredo}`, segredo }
}

/** Tech Provider Configurations do app (o config_id que o Embedded Signup usa). */
export async function configuracoesTechProvider(): Promise<{ id: string; name: string }[]> {
  const { appId, tokenDoApp } = credenciaisDoApp()
  const j = await graphGet(`/${appId}?fields=config_ids`, tokenDoApp)
  return j.config_ids || []
}

/**
 * Troca o code do Embedded Signup pelo token de negócio do cliente. Esse token
 * não vence em 24h como o token de teste do painel.
 */
export async function trocarCodigoPorToken(code: string): Promise<string> {
  const { appId, segredo } = credenciaisDoApp()
  const url = `${GRAPH}/${GRAPH_VERSION}/oauth/access_token?client_id=${appId}&client_secret=${encodeURIComponent(segredo)}&code=${encodeURIComponent(code)}`
  const res = await fetch(url, { cache: 'no-store' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) throw mensagemDaMeta(j, 'A Meta não trocou o código por token.')
  return j.access_token as string
}

/** Inscreve o app nos webhooks da WABA do cliente (sem isso as mensagens não chegam). */
export const inscreverAppNaWaba = (wabaId: string, token: string) => graphPost(`/${wabaId}/subscribed_apps`, token)

/** Registra o número na Cloud API. O PIN vira o PIN de duas etapas do número. */
export function registrarNumero(phoneId: string, token: string) {
  const pin = process.env.FB_REG_PIN
  if (!pin || !/^\d{6}$/.test(pin)) throw new ErroMeta('FB_REG_PIN precisa ser um PIN de 6 dígitos.', 500)
  return graphPost(`/${phoneId}/register`, token, { messaging_product: 'whatsapp', pin })
}

export const descadastrarNumero = (phoneId: string, token: string) => graphPost(`/${phoneId}/deregister`, token)

export const pedirCodigo = (phoneId: string, token: string, metodo: 'SMS' | 'VOICE' = 'SMS') =>
  graphPost(`/${phoneId}/request_code`, token, { code_method: metodo, language: 'pt_BR' })

export const verificarCodigo = (phoneId: string, token: string, codigo: string) =>
  graphPost(`/${phoneId}/verify_code`, token, { code: codigo })

export interface NumeroDaWaba {
  id: string
  display_phone_number: string
  verified_name: string
  status?: string
  quality_rating?: string
  code_verification_status?: string
  name_status?: string
  platform_type?: string
}

export async function numerosDaWaba(wabaId: string, token: string): Promise<NumeroDaWaba[]> {
  const j = await graphGet(
    `/${wabaId}/phone_numbers?fields=display_phone_number,verified_name,status,quality_rating,code_verification_status,name_status,platform_type`,
    token,
  )
  return j.data || []
}

/**
 * A WABA tem forma de pagamento? Template de marketing/utilidade é cobrado; sem
 * pagamento a Meta recusa. Mesma leitura do app modelo: erro de "payment method"
 * na entidade WABA do health_status. Na dúvida (erro ao consultar) devolve null.
 */
export async function wabaTemPagamento(wabaId: string, token: string): Promise<boolean | null> {
  try {
    const j = await graphGet(`/${wabaId}?fields=health_status`, token)
    const entidades: any[] = j.health_status?.entities || []
    const waba = entidades.find((e) => e.entity_type === 'WABA')
    return !(waba?.errors || []).some((e: any) => String(e.possible_solution || '').toLowerCase().includes('payment method'))
  } catch {
    return null
  }
}
