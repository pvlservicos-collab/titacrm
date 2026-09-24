/**
 * GET /api/integrations/whatsapp-cloud/webhook-events?limite=50
 * Últimos eventos crus da Meta (meta_webhook_events), pra depurar: o que chegou,
 * quando, e o que o processamento fez com cada um. O primeiro da lista é o
 * "último evento recebido" — separa "ninguém mandou nada" de "o endpoint morreu".
 *
 * Só da WABA desta organização: os eventos são de todos os clientes do app.
 */
import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { exigirGestaoDeIntegracoes } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { metaWebhookEvents } from '@/lib/schema'
import { desc, sql } from 'drizzle-orm'
import { lerIntegracaoCloud } from '@/lib/whatsappIntegracao'

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await exigirGestaoDeIntegracoes(auth)
    const integ = await lerIntegracaoCloud(auth.organizationId)
    const wabaId = integ?.config?.waba_id
    if (!wabaId) return Response.json({ eventos: [] })

    const limite = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limite')) || 50))
    const eventos = await db.select().from(metaWebhookEvents)
      .where(sql`${metaWebhookEvents.payload}->'entry'->0->>'id' = ${wabaId}`)
      .orderBy(desc(metaWebhookEvents.receivedAt))
      .limit(limite)
    return Response.json({ eventos })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
