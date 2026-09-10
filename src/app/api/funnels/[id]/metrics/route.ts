import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { messageFunnels, funnelExecutions, funnelClickEvents, funnelResponseEvents, leadActivities } from '@/lib/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'

/**
 * GET /api/funnels/[id]/metrics
 * Métricas por bloco: quanto saiu, quanto entregou, cliques e respostas.
 *
 * `enviado` sai de `lead_activities`, que é onde o disparo do funil grava cada
 * mensagem com o `block_id` dentro do metadata — não existe tabela de envio
 * separada, e nem precisa: a mensagem enviada JÁ é uma atividade do lead.
 *
 * Não existe "aberto"/"visualizado" aqui de propósito. Ninguém registra recibo
 * de leitura no CRM ainda, e uma coluna dessas com número inventado é pior que
 * coluna nenhuma — quem olha toma decisão em cima dela.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    const { id } = await params

    const [funnel] = await db.select({ id: messageFunnels.id }).from(messageFunnels)
      .where(and(eq(messageFunnels.id, id), eq(messageFunnels.organizationId, auth.organizationId), isNull(messageFunnels.deletedAt)))
      .limit(1)
    if (!funnel) return apiError(404, 'Funil não encontrado.')

    // Quanto cada bloco disparou, e quanto disso a operadora aceitou.
    const envios = await db.select({
      blockId: sql<string>`${leadActivities.metadata}->>'block_id'`,
      enviado: sql<number>`count(*)::int`,
      entregue: sql<number>`count(*) filter (where ${leadActivities.metadata}->>'send_status' = 'sent')::int`,
      falhou: sql<number>`count(*) filter (where ${leadActivities.metadata}->>'send_status' = 'failed')::int`,
    }).from(leadActivities)
      .where(and(
        eq(leadActivities.organizationId, auth.organizationId),
        sql`${leadActivities.metadata}->>'funnel_id' = ${id}`,
        sql`${leadActivities.metadata}->>'block_id' IS NOT NULL`
      ))
      .groupBy(sql`${leadActivities.metadata}->>'block_id'`)

    const clicks = await db.select({
      blockId: funnelClickEvents.blockId,
      total: sql<number>`count(*)::int`,
      clicados: sql<number>`count(*) filter (where ${funnelClickEvents.clicked})::int`,
    }).from(funnelClickEvents)
      .innerJoin(funnelExecutions, eq(funnelExecutions.id, funnelClickEvents.executionId))
      .where(eq(funnelExecutions.funnelId, id))
      .groupBy(funnelClickEvents.blockId)

    const responses = await db.select({
      blockId: funnelResponseEvents.blockId,
      branch: funnelResponseEvents.branch,
      total: sql<number>`count(*)::int`,
    }).from(funnelResponseEvents)
      .innerJoin(funnelExecutions, eq(funnelExecutions.id, funnelResponseEvents.executionId))
      .where(eq(funnelExecutions.funnelId, id))
      .groupBy(funnelResponseEvents.blockId, funnelResponseEvents.branch)

    const responsesByBlock: Record<string, { yes: number; no: number }> = {}
    for (const r of responses) {
      if (!responsesByBlock[r.blockId]) responsesByBlock[r.blockId] = { yes: 0, no: 0 }
      if (r.branch === 'yes') responsesByBlock[r.blockId].yes = r.total
      if (r.branch === 'no') responsesByBlock[r.blockId].no = r.total
    }

    return Response.json({
      data: {
        envios: envios.map((e) => ({
          block_id: e.blockId,
          enviado: e.enviado,
          entregue: e.entregue,
          falhou: e.falhou,
          taxa_entrega: e.enviado > 0 ? e.entregue / e.enviado : 0,
        })),
        clicks: clicks.map(c => ({ block_id: c.blockId, total: c.total, clicados: c.clicados, taxa: c.total > 0 ? c.clicados / c.total : 0 })),
        responses: Object.entries(responsesByBlock).map(([blockId, v]) => ({
          block_id: blockId,
          sim: v.yes,
          nao: v.no,
          taxa_resposta: (v.yes + v.no) > 0 ? v.yes / (v.yes + v.no) : 0,
        })),
      },
    })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
