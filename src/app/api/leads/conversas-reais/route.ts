import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { leadActivities } from '@/lib/schema'
import { and, eq, sql } from 'drizzle-orm'

/**
 * Ids dos leads que têm conversa de verdade no WhatsApp: a pessoa escreveu, ou
 * uma mensagem nossa foi entregue. Fica de fora quem só tem tentativa que falhou
 * (o número estava fora do ar) e o catálogo de contatos importado do aparelho.
 * Só filtra o que aparece; nada é apagado.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    const rows = await db.selectDistinct({ leadId: leadActivities.leadId }).from(leadActivities)
      .where(and(
        eq(leadActivities.organizationId, auth.organizationId),
        eq(leadActivities.type, 'whatsapp'),
        sql`(
          ${leadActivities.metadata}->>'direction' = 'inbound'
          OR (
            ${leadActivities.metadata}->>'direction' = 'outbound'
            AND coalesce(${leadActivities.metadata}->>'send_status', 'sent') <> 'failed'
            AND coalesce(${leadActivities.metadata}->>'nao_entregue', 'false') <> 'true'
          )
        )`,
      ))
    return Response.json({ data: rows.map((r) => r.leadId) })
  } catch (err: any) { return apiError(err.status || 500, err.message || 'Erro interno.') }
}
