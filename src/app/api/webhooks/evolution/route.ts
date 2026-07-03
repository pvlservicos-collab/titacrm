import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leads, leadActivities, integrations, pipelineStages } from '@/lib/schema'
import { eq, and, isNull, asc, ilike } from 'drizzle-orm'
import { publishEvent, channels, events } from '@/lib/realtime'

function extractMessage(data: any): { text: string; mediaUrl?: string; mediaType?: string } | null {
  const msg = data?.message
  if (!msg) return null

  if (msg.conversation) return { text: msg.conversation }
  if (msg.extendedTextMessage?.text) return { text: msg.extendedTextMessage.text }
  if (msg.imageMessage) return { text: msg.imageMessage.caption || '', mediaType: 'image', mediaUrl: msg.imageMessage.url }
  if (msg.videoMessage) return { text: msg.videoMessage.caption || '', mediaType: 'video', mediaUrl: msg.videoMessage.url }
  if (msg.audioMessage) return { text: '[Áudio]', mediaType: 'audio', mediaUrl: msg.audioMessage.url }
  if (msg.documentMessage) return { text: msg.documentMessage.fileName || '[Documento]', mediaType: 'document', mediaUrl: msg.documentMessage.url }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get('org_id')
    if (!orgId) return NextResponse.json({ ok: false, error: 'org_id ausente' }, { status: 400 })

    const body = await req.json()

    // Only handle messages.upsert
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const data = body.data
    const key = data?.key
    if (!key) return NextResponse.json({ ok: true, skipped: 'no key' })

    // fromMe = true também ocorre quando a mensagem é enviada direto pelo WhatsApp
    // (fora do CRM). Nesse caso registramos como atividade outbound em vez de ignorar.
    const isFromMe = !!key.fromMe

    // Extract phone from remoteJid (format: "5511999999999@s.whatsapp.net" or "@g.us" for groups).
    // Contatos endereçados no novo modo "lid" ("<id>@lid") não carregam o telefone em remoteJid;
    // o número real vem em remoteJidAlt ("5511999999999@s.whatsapp.net").
    const remoteJid: string = key.remoteJid || ''
    const isGroup = remoteJid.endsWith('@g.us')
    const phoneJid = (!isGroup && key.addressingMode === 'lid' && key.remoteJidAlt) ? key.remoteJidAlt : remoteJid
    const phone = phoneJid.split('@')[0]
    if (!phone) return NextResponse.json({ ok: true, skipped: 'no phone' })

    const extracted = extractMessage(data)
    if (!extracted) return NextResponse.json({ ok: true, skipped: 'no message content' })

    const senderName = data?.pushName || phone

    // Find the Evolution integration for this org
    const [integration] = await db
      .select({ id: integrations.id })
      .from(integrations)
      .where(
        and(
          eq(integrations.organizationId, orgId),
          eq(integrations.type, 'whatsapp_evolution'),
          isNull(integrations.deletedAt)
        )
      )
      .limit(1)

    // Find or create lead by phone
    let [lead] = await db
      .select({ id: leads.id, title: leads.title, phone: leads.phone })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, orgId),
          eq(leads.phone, phone),
          isNull(leads.deletedAt)
        )
      )
      .limit(1)

    if (!lead) {
      const [firstStage] = await db
        .select({ id: pipelineStages.id })
        .from(pipelineStages)
        .where(
          and(
            eq(pipelineStages.organizationId, orgId),
            isNull(pipelineStages.deletedAt)
          )
        )
        .orderBy(asc(pipelineStages.rank))
        .limit(1)

      const [newLead] = await db
        .insert(leads)
        .values({
          organizationId: orgId,
          // Em fromMe, pushName é o nome do próprio dono do WhatsApp, não do contato.
          title: isFromMe ? phone : (senderName || phone),
          phone,
          isGroup,
          integrationId: integration?.id || null,
          stageId: firstStage?.id || null,
          lastActivityAt: new Date(),
        })
        .returning({ id: leads.id, title: leads.title, phone: leads.phone })

      lead = newLead
    }

    // Deduplicate by Evolution message ID
    const messageId = key.id
    if (messageId) {
      const existing = await db
        .select({ id: leadActivities.id })
        .from(leadActivities)
        .where(
          and(
            eq(leadActivities.organizationId, orgId),
            eq(leadActivities.leadId, lead.id)
          )
        )
        .limit(100)

      const duplicate = existing.find(
        (a: any) => (a as any).metadata?.evolution_message_id === messageId
      )
      if (duplicate) return NextResponse.json({ ok: true, skipped: 'duplicate' })
    }

    const metadata: Record<string, any> = {
      source: 'evolution',
      direction: isFromMe ? 'outbound' : 'inbound',
      evolution_message_id: messageId,
    }
    if (!isFromMe) metadata.sender_name = senderName
    if (extracted.mediaUrl) metadata.media_url = extracted.mediaUrl
    if (extracted.mediaType) metadata.media_type = extracted.mediaType

    const [activity] = await db
      .insert(leadActivities)
      .values({
        organizationId: orgId,
        leadId: lead.id,
        type: 'whatsapp',
        content: extracted.text,
        metadata,
      })
      .returning({ id: leadActivities.id })

    // Update lead
    const leadUpdates: Record<string, any> = {
      lastMessageContent: extracted.text,
      lastMessageSenderType: isFromMe ? 'human' : 'lead',
      lastActivityAt: new Date(),
      lastActivityType: 'whatsapp',
      isUnread: !isFromMe,
      integrationId: integration?.id || null,
    }
    if (!isFromMe) {
      leadUpdates.title = lead.title === lead.phone ? senderName : lead.title
    } else {
      const [stage] = await db
        .select({ id: pipelineStages.id })
        .from(pipelineStages)
        .where(
          and(
            eq(pipelineStages.organizationId, orgId),
            isNull(pipelineStages.deletedAt),
            ilike(pipelineStages.name, 'Em atendimento')
          )
        )
        .limit(1)
      if (stage) leadUpdates.stageId = stage.id
    }

    await db.update(leads).set(leadUpdates).where(eq(leads.id, lead.id))

    await publishEvent(channels.leadActivities(lead.id), events.ACTIVITY_CREATED, { id: activity.id })
    await publishEvent(channels.orgLeads(orgId), events.LEAD_UPDATED, { id: lead.id })

    return NextResponse.json({ ok: true, activityId: activity.id })
  } catch (err: any) {
    console.error('[evolution webhook]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// Evolution API uses POST for webhook verification too
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Evolution webhook endpoint active' })
}
