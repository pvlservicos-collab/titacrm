import { db } from '@/lib/db'
import { integrations } from '@/lib/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { ZAPI_INTEGRATION_TYPE } from '@/lib/zapi'
import { enviarRelatorioDoDia } from '@/lib/relatorioDiario'

/**
 * GET /api/cron/relatorio-diario — relatório do dia no grupo, às 23h de Brasília.
 *
 * Chamado pelo Cron da Vercel às 02:00 UTC (ver vercel.json). Sem autenticação,
 * como os outros crons: chamar de novo não faz mal, porque o envio é uma vez só
 * por dia (trava em enviarRelatorioDoDia). Precisa estar em `publicPaths` do
 * middleware — sem isso o cron leva redirect pro login e nunca roda.
 */
async function rodar() {
  const orgs = await db
    .selectDistinct({ organizationId: integrations.organizationId })
    .from(integrations)
    .where(and(
      eq(integrations.type, ZAPI_INTEGRATION_TYPE),
      isNull(integrations.deletedAt),
      sql`${integrations.config}->>'relatorio_diario_grupo' IS NOT NULL`
    ))

  const resultado: Record<string, unknown> = {}
  for (const { organizationId } of orgs) {
    try {
      resultado[organizationId] = await enviarRelatorioDoDia(organizationId)
    } catch (err: any) {
      console.error('[relatorio-diario] falhou:', organizationId, err)
      resultado[organizationId] = { enviado: false, erro: err?.message }
    }
  }
  return Response.json({ status: 'ok', resultado })
}

export const GET = rodar
export const POST = rodar
