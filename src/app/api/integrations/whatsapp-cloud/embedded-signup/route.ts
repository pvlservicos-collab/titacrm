/**
 * Embedded Signup da API Oficial (fluxo de Tech Provider).
 *
 * GET  → o que o navegador precisa pra abrir o FB.login: app id, versão do SDK,
 *        versão do Embedded Signup e as Tech Provider Configurations do app.
 * POST → { code, waba_id, phone_number_id, business_id }: troca o code pelo
 *        token de negócio, grava a integração, inscreve o app na WABA e
 *        registra o número. Mesma sequência do app modelo da Meta
 *        (fbsamples/business-messaging-sample-tech-provider-app, api/token).
 *
 * Cada passo depois da troca do token é independente: se registrar o número
 * falhar (já registrado, PIN diferente), a integração continua gravada e a
 * resposta diz qual passo falhou, pra dar pra refazer só ele na lista de números.
 */
import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { exigirGestaoDeIntegracoes } from '@/lib/admin-auth'
import {
  GRAPH_VERSION, configuracoesTechProvider, credenciaisDoApp,
  trocarCodigoPorToken, inscreverAppNaWaba, registrarNumero, numerosDaWaba,
} from '@/lib/meta'
import { sincronizarAppBusiness } from '@/lib/coexistencia'
import { salvarIntegracaoCloud, lerIntegracaoCloud } from '@/lib/whatsappIntegracao'

const soDigitos = (v: unknown) => (typeof v === 'string' && /^\d+$/.test(v) ? v : null)

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await exigirGestaoDeIntegracoes(auth)
    const { appId } = credenciaisDoApp()
    const [configs, atual] = await Promise.all([
      configuracoesTechProvider().catch(() => [] as { id: string; name: string }[]),
      lerIntegracaoCloud(auth.organizationId),
    ])
    // A configuração escolhida (FB_ES_CONFIG_ID) vem primeiro: é a que a tela
    // seleciona. A ordem da Meta muda quando se cria uma configuração nova.
    const preferida = process.env.FB_ES_CONFIG_ID
    configs.sort((a, b) => Number(b.id === preferida) - Number(a.id === preferida))
    return Response.json({
      app_id: appId,
      sdk_version: GRAPH_VERSION,
      es_version: process.env.FB_ES_VERSION || 'v3',
      configs,
      conectado: atual?.config?.waba_id
        ? { waba_id: atual.config.waba_id, phone_number_id: atual.config.phone_number_id, origem: atual.config.origem || 'manual', coexistencia: !!atual.config.coexistencia }
        : null,
    })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

type Passo = { passo: string; ok: boolean; erro?: string }

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await exigirGestaoDeIntegracoes(auth)
    const body = await req.json().catch(() => ({}))

    const code = typeof body.code === 'string' && body.code ? body.code : null
    const wabaId = soDigitos(body.waba_id)
    let phoneId = soDigitos(body.phone_number_id)
    // Coexistência: número que fica também no aplicativo WhatsApp Business.
    const coexistencia = body.modo === 'coexistencia'
    const businessId = soDigitos(body.business_id)
    if (!code) return apiError(400, 'Código do Embedded Signup ausente.')
    if (!wabaId) return apiError(400, 'A Meta não devolveu a conta do WhatsApp (waba_id). Refaça a conexão.')
    if (!phoneId && !coexistencia) return apiError(400, 'A Meta não devolveu o número (phone_number_id). Refaça a conexão escolhendo um número.')

    // Sem token não há o que salvar: aqui o erro derruba a conexão inteira.
    const token = await trocarCodigoPorToken(code)

    // Na coexistência a sessão pode vir sem o phone_number_id: a conta do
    // aplicativo tem um número só, então ele é lido da própria WABA.
    if (!phoneId) {
      const numeros = await numerosDaWaba(wabaId, token)
      phoneId = numeros[0]?.id ?? null
      if (!phoneId) return apiError(400, 'A conta conectada não tem número. Refaça a conexão.')
    }

    const passos: Passo[] = [{ passo: 'Token de acesso', ok: true }]
    await salvarIntegracaoCloud(auth.organizationId, {
      waba_id: wabaId,
      phone_number_id: phoneId,
      business_id: businessId,
      graph_api_version: GRAPH_VERSION,
      origem: 'embedded_signup',
      coexistencia,
    }, token)
    passos.push({ passo: 'Integração salva', ok: true })

    const tentar = async (passo: string, fn: () => Promise<unknown>) => {
      try {
        await fn()
        passos.push({ passo, ok: true })
      } catch (e: any) {
        passos.push({ passo, ok: false, erro: e?.message || String(e) })
      }
    }
    await tentar('Webhooks da conta inscritos', () => inscreverAppNaWaba(wabaId, token))
    if (coexistencia) {
      // NUNCA registrar na coexistência: o /register tira o número do aplicativo.
      // A Meta dá 24h pra pedir a sincronização; pedimos na hora.
      await tentar('Contatos do aplicativo sincronizando', () => sincronizarAppBusiness(phoneId!, token, 'smb_app_state_sync'))
      await tentar('Histórico de conversas sincronizando', () => sincronizarAppBusiness(phoneId!, token, 'history'))
    } else {
      await tentar('Número registrado na Cloud API', () => registrarNumero(phoneId!, token))
    }

    return Response.json({ ok: true, waba_id: wabaId, phone_number_id: phoneId, coexistencia, passos })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
