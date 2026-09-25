import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { integrations, leads } from '@/lib/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { publishEvent, channels, events } from '@/lib/realtime'

/**
 * "Conversar por Michele / Augusto / Cau": liga o lead àquela linha da
 * Evolution, e é por ela que a resposta do chat sai. Só uma pessoa logada
 * escolhe — a linha só responde à mão (ver CLAUDE.md).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    if (!auth.memberId) return apiError(403, 'Só uma pessoa logada no CRM escolhe por qual número conversar.')
    const { id } = await params
    const { linhaId } = await req.json().catch(() => ({}))
    if (!linhaId || typeof linhaId !== 'string') return apiError(400, 'linhaId é obrigatório.')

    const [linha] = await db.select({ id: integrations.id }).from(integrations)
      .where(and(
        eq(integrations.id, linhaId),
        eq(integrations.organizationId, auth.organizationId),
        eq(integrations.type, 'whatsapp_evolution'),
        isNull(integrations.deletedAt)
      ))
      .limit(1)
    if (!linha) return apiError(404, 'Linha não encontrada.')

    const [lead] = await db.select({ id: leads.id, phone: leads.phone, isGroup: leads.isGroup }).from(leads)
      .where(and(eq(leads.id, id), eq(leads.organizationId, auth.organizationId), isNull(leads.deletedAt)))
      .limit(1)
    if (!lead) return apiError(404, 'Lead não encontrado.')
    if (!lead.phone || lead.isGroup) return apiError(400, 'Só lead com telefone (e que não seja grupo) conversa por uma linha.')

    await db.update(leads).set({ integrationId: linha.id }).where(eq(leads.id, lead.id))
    await publishEvent(channels.orgLeads(auth.organizationId), events.LEAD_UPDATED, { id: lead.id })
    return Response.json({ data: { integration_id: linha.id } })
  } catch (err: any) { return apiError(err.status || 500, err.message || 'Erro interno.') }
}
