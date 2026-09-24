/**
 * POST /api/leads/[id]/template
 * Envia um template da API Oficial pro lead e grava na conversa.
 *
 * Body: { name, language, params?: string[], header_params?: string[] }
 *
 * O texto gravado é montado aqui, a partir do template que a Meta devolve —
 * não do que o navegador mandou —, pra conversa mostrar exatamente o que
 * chegou no WhatsApp do cliente.
 */
import { NextRequest } from 'next/server'
import { authenticateRequest, apiError, validateRequired } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { leads, leadActivities, integrations } from '@/lib/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { publishEvent, channels, events } from '@/lib/realtime'
import { buscarTemplate, enviarTemplate, renderizar } from '@/lib/whatsappTemplates'
import { isUniqueViolation } from '@/lib/db-helpers'
import { exigirCotaDeEnvio } from '@/lib/revisor'

const texto = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()) : [])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const faltando = validateRequired(body ?? {}, ['name', 'language'])
    if (faltando) return apiError(400, faltando)

    const [lead] = await db
      .select({ id: leads.id, phone: leads.phone, integrationId: leads.integrationId })
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.organizationId, auth.organizationId), isNull(leads.deletedAt)))
      .limit(1)
    if (!lead) return apiError(404, 'Contato não encontrado.')
    if (!lead.phone) return apiError(400, 'Este contato não tem telefone.')

    const template = await buscarTemplate(auth.organizationId, body.name, body.language)
    if (!template) return apiError(400, 'Template não encontrado ou não pode ser enviado pelo chat.')

    const valores = texto(body.params)
    const valoresCabecalho = texto(body.header_params)
    if (valores.slice(0, template.bodyParams).filter(Boolean).length < template.bodyParams
      || valoresCabecalho.slice(0, template.headerParams).filter(Boolean).length < template.headerParams) {
      return apiError(400, 'Preencha todas as variáveis do template.')
    }

    await exigirCotaDeEnvio(auth)
    const { messageId, waId } = await enviarTemplate(auth.organizationId, lead.phone, template, valores, valoresCabecalho)
    const conteudo = renderizar(template, valores, valoresCabecalho)

    const [activity] = await db.insert(leadActivities).values({
      organizationId: auth.organizationId,
      leadId: lead.id,
      actorMemberId: auth.memberId || null,
      type: 'whatsapp',
      content: conteudo,
      metadata: {
        direction: 'outbound',
        source: 'human',
        channel: 'whatsapp_cloud_official',
        send_status: 'sent',
        template_name: template.name,
        template_language: template.language,
        ...(messageId ? { whatsapp_message_id: messageId } : {}),
      },
    }).returning({ id: leadActivities.id })

    // A resposta do cliente chega pela API Oficial: o lead passa a ser dela,
    // senão a resposta do chat sairia pelo canal padrão (Z-API).
    const updates: Record<string, any> = {
      lastMessageContent: conteudo,
      lastMessageSenderType: 'human',
      lastActivityAt: new Date(),
      lastActivityType: 'whatsapp',
      lastActivityByMemberId: auth.memberId || null,
      isArchived: false,
    }
    if (!lead.integrationId) {
      const [cloud] = await db.select({ id: integrations.id }).from(integrations)
        .where(and(eq(integrations.organizationId, auth.organizationId), eq(integrations.type, 'whatsapp_cloud_official'), isNull(integrations.deletedAt)))
        .limit(1)
      if (cloud) updates.integrationId = cloud.id
    }
    await db.update(leads).set(updates).where(eq(leads.id, lead.id))

    // Celular brasileiro: a Meta pode resolver o número sem o nono dígito, e as
    // respostas chegam nesse formato. Grava o dela, senão a resposta abre outro
    // contato. Se já existir um contato com esse número, deixa como está.
    if (waId && /^\d+$/.test(waId) && waId !== lead.phone) {
      try {
        await db.update(leads).set({ phone: waId }).where(eq(leads.id, lead.id))
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
      }
    }

    await publishEvent(channels.leadActivities(lead.id), events.ACTIVITY_CREATED, { id: activity.id })
    await publishEvent(channels.orgLeads(auth.organizationId), events.LEAD_UPDATED, { id: lead.id })

    return Response.json({ id: activity.id, content: conteudo, whatsapp_message_id: messageId })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
