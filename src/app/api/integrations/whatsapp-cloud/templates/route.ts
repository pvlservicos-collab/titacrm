/**
 * GET /api/integrations/whatsapp-cloud/templates
 * Templates aprovados da API Oficial que dá pra enviar pelo chat.
 * Ver src/lib/whatsappTemplates.ts.
 */
import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { listarTemplates } from '@/lib/whatsappTemplates'
import { wabaTemPagamento } from '@/lib/meta'
import { lerIntegracaoCloud } from '@/lib/whatsappIntegracao'

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    const [templates, integ] = await Promise.all([listarTemplates(auth.organizationId), lerIntegracaoCloud(auth.organizationId)])
    // null = nao deu pra saber; o painel so avisa quando e false com certeza.
    const pagamento = integ?.config?.waba_id && integ.token ? await wabaTemPagamento(integ.config.waba_id, integ.token) : null
    return Response.json({ templates, pagamento })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
