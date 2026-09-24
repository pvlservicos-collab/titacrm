/**
 * GET /api/integrations/whatsapp-cloud/diagnostico
 *
 * O que falta pra API Oficial funcionar, numa resposta só: variáveis de
 * ambiente presentes, credenciais salvas, número respondendo na Meta, templates
 * aprovados e o último evento que o webhook recebeu.
 *
 * Existe porque a configuração tem peças em três lugares (Vercel, tela do CRM,
 * painel da Meta) e, quando uma falta, o sintoma é sempre o mesmo: "não chega
 * mensagem". Aqui cada peça aparece separada, com o nome que ela tem em cada
 * lugar.
 *
 * NUNCA devolve valor de segredo — só se está preenchido ou não.
 */
import { NextRequest } from 'next/server'
import { desc, sql } from 'drizzle-orm'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { metaWebhookEvents } from '@/lib/schema'
import { lerIntegracaoCloud } from '@/lib/whatsappIntegracao'
import { getWhatsAppCredentials } from '@/lib/whatsapp'
import { listarTemplates } from '@/lib/whatsappTemplates'
import { GRAPH_VERSION } from '@/lib/meta'

function baseDoApp(req: NextRequest): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return req.nextUrl.origin
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)

    const integ = await lerIntegracaoCloud(auth.organizationId)

    // Número: pergunta pra própria Meta. É o que prova que o token tem acesso
    // àquele phone_number_id — salvar credenciais não prova nada.
    let numero: { display: string | null; nome: string | null; qualidade: string | null } | null = null
    let erroNumero: string | null = null
    try {
      const { apiVersion, phoneNumberId, token } = await getWhatsAppCredentials(auth.organizationId)
      const res = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        numero = {
          display: data?.display_phone_number ?? null,
          nome: data?.verified_name ?? null,
          qualidade: data?.quality_rating ?? null,
        }
      } else {
        erroNumero = data?.error?.message || `HTTP ${res.status}`
      }
    } catch (err: any) {
      erroNumero = err?.message || 'Não configurado'
    }

    let templates: { total: number; aprovados: number } | null = null
    let erroTemplates: string | null = null
    try {
      const lista = await listarTemplates(auth.organizationId)
      templates = {
        total: lista.length,
        aprovados: lista.filter((t: any) => String(t.status).toUpperCase() === 'APPROVED').length,
      }
    } catch (err: any) {
      erroTemplates = err?.message || 'Não foi possível listar'
    }

    const [ultimo] = await db
      .select({
        recebidoEm: metaWebhookEvents.receivedAt,
        status: metaWebhookEvents.status,
        objeto: metaWebhookEvents.object,
        erro: metaWebhookEvents.error,
      })
      .from(metaWebhookEvents)
      .orderBy(desc(metaWebhookEvents.receivedAt))
      .limit(1)

    const [contagem] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(metaWebhookEvents)
    const eventos = contagem?.total ?? 0

    return Response.json({
      webhook: {
        url: `${baseDoApp(req)}/api/webhooks/facebook`,
        campos: ['messages', 'message_template_status_update'],
        camposCoexistencia: ['smb_message_echoes', 'history', 'smb_app_state_sync'],
        ativo: process.env.META_WEBHOOK_ATIVO !== 'nao',
        ultimoEvento: ultimo ?? null,
        totalEventos: Number(eventos) || 0,
      },
      // Só presença: o valor de cada uma fica na Vercel.
      variaveis: {
        FB_APP_ID: !!process.env.FB_APP_ID,
        FACEBOOK_APP_SECRET: !!process.env.FACEBOOK_APP_SECRET,
        FACEBOOK_WEBHOOK_VERIFY_TOKEN: !!process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
        FB_ES_CONFIG_ID: !!process.env.FB_ES_CONFIG_ID,
        FB_REG_PIN: !!process.env.FB_REG_PIN,
        FB_GRAPH_API_VERSION: GRAPH_VERSION,
      },
      credenciais: {
        salvas: !!integ,
        waba_id: integ?.config?.waba_id ?? null,
        phone_number_id: integ?.config?.phone_number_id ?? null,
        temToken: !!integ?.token,
      },
      numero,
      erroNumero,
      templates,
      erroTemplates,
    })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
