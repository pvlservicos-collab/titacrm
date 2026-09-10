import { after } from 'next/server'
import { db } from '@/lib/db'
import { leads, leadActivities, integrations, pipelineStages, webhookLogs } from '@/lib/schema'
import { eq, and, isNull, asc, ilike } from 'drizzle-orm'
import { publishEvent, channels, events } from '@/lib/realtime'
import { dispatchOutboundWebhook } from '@/lib/outbound-webhook'
import { isUniqueViolation } from '@/lib/db-helpers'
import { notifyInboundMessage } from '@/lib/push'
import { ZAPI_INTEGRATION_TYPE, rehospedarMidiaZapi, rehospedarFotoPerfil } from '@/lib/zapi'

/**
 * Entrada de mensagens da Z-API.
 *
 * Espelha o que `evolutionInbound.ts` faz — resolve o lead pelo telefone, extrai
 * conteúdo e mídia, deduplica e grava a atividade — porque o resultado no CRM
 * precisa ser idêntico venha de onde vier: mesma timeline, mesmos campos, mesmo
 * comportamento de não-lido e de etapa. O que muda é só o formato do payload.
 *
 * O payload da Z-API é bem mais simples que o da Evolution/Baileys: em vez de
 * `message.imageMessage.url` embrulhado em containers de efêmera/ver-uma-vez,
 * vem um objeto por tipo (`image.imageUrl`, `audio.audioUrl`…) já resolvido, e a
 * URL é pública. Em compensação ela expira em 30 dias, daí o re-hospedar.
 */

export type ZapiProcessResult =
  | { status: 'created'; activityId: string }
  | { status: 'skipped'; reason: string }

export async function logZapiDiagnostico(reason: string, orgId: string, body: any) {
  try {
    await db.insert(webhookLogs).values({ payload: { origem: 'zapi', reason, org_id: orgId, body } })
  } catch (err) {
    console.error('[zapi webhook] diagnóstico não gravado', err)
  }
}

interface Extraido {
  text: string
  mediaUrl?: string
  mediaType?: string
  mediaMimetype?: string
  mediaFilename?: string
  audioSeconds?: number
}

/**
 * Conteúdo da mensagem, seja qual for o tipo.
 *
 * Cobre também os tipos que não têm mídia pra mostrar (contato, localização,
 * enquete): em vez de descartar — que foi o erro que já custou mensagens
 * invisíveis na Evolution — grava um texto dizendo o que chegou. Uma linha
 * "📍 Localização" na conversa é infinitamente melhor que um silêncio que
 * ninguém consegue explicar depois.
 */
function extrair(body: any): Extraido | null {
  if (body?.text?.message) return { text: String(body.text.message) }

  if (body?.image) {
    return {
      text: body.image.caption || '',
      mediaType: 'image',
      mediaUrl: body.image.imageUrl,
      mediaMimetype: body.image.mimeType,
    }
  }
  if (body?.video) {
    return {
      text: body.video.caption || '',
      mediaType: 'video',
      mediaUrl: body.video.videoUrl,
      mediaMimetype: body.video.mimeType,
    }
  }
  if (body?.audio) {
    return {
      text: '[Áudio]',
      mediaType: 'audio',
      mediaUrl: body.audio.audioUrl,
      mediaMimetype: body.audio.mimeType,
      audioSeconds: body.audio.seconds,
    }
  }
  if (body?.document) {
    return {
      text: body.document.fileName || '[Documento]',
      mediaType: 'document',
      mediaUrl: body.document.documentUrl,
      mediaMimetype: body.document.mimeType,
      mediaFilename: body.document.fileName,
    }
  }
  if (body?.sticker) {
    return { text: '[Figurinha]', mediaType: 'image', mediaUrl: body.sticker.stickerUrl }
  }

  if (body?.contact) {
    const nome = body.contact.displayName || body.contact.vCard?.split('FN:')[1]?.split('\n')[0] || 'contato'
    return { text: `👤 Contato compartilhado: ${nome}` }
  }
  if (body?.location) {
    const { latitude, longitude, address } = body.location
    return { text: `📍 Localização: ${address || `${latitude}, ${longitude}`}` }
  }
  if (body?.poll?.question) return { text: `📊 Enquete: ${body.poll.question}` }
  if (body?.reaction?.value) return { text: `Reagiu com ${body.reaction.value}` }
  if (body?.buttonsResponseMessage?.message) return { text: String(body.buttonsResponseMessage.message) }
  if (body?.listResponseMessage?.title) return { text: String(body.listResponseMessage.title) }

  return null
}

/**
 * Processa uma mensagem recebida da Z-API.
 *
 * Idempotente: reprocessar o mesmo `messageId` cai em 'duplicate'. A Z-API
 * reenvia o webhook quando a nossa resposta demora ou falha, então isso não é
 * teoria — sem o dedupe a mesma mensagem apareceria duas vezes na conversa.
 */
export async function processZapiMessage(orgId: string, body: any): Promise<ZapiProcessResult> {
  const messageId: string | undefined = body?.messageId
  const phoneBruto: string = String(body?.phone || '')
  const phone = phoneBruto.replace(/\D/g, '')
  if (!phone) return { status: 'skipped', reason: 'sem telefone' }

  // Mesma política da Evolution: grupo não vira conversa no CRM. Uma mensagem de
  // grupo mistura várias pessoas num "contato" só, com risco real de dado de um
  // cliente aparecer na conversa de outro.
  if (body?.isGroup) return { status: 'skipped', reason: 'grupo' }

  // Status de mensagem ("entregue", "lida") não é conteúdo — vem por outro
  // callback e nunca deve virar linha na timeline.
  if (body?.type && body.type !== 'ReceivedCallback') {
    return { status: 'skipped', reason: `callback ${body.type}` }
  }

  const isFromMe = !!body?.fromMe
  const extraido = extrair(body)
  if (!extraido) {
    // Formato ainda não mapeado: registra o payload pra dar pra descobrir o que
    // era, em vez de a mensagem sumir sem rastro.
    await logZapiDiagnostico('conteudo_nao_extraido', orgId, body)
    return { status: 'skipped', reason: 'sem conteúdo reconhecido' }
  }

  const senderName: string = body?.senderName || body?.chatName || phone

  const [integration] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(
      eq(integrations.organizationId, orgId),
      eq(integrations.type, ZAPI_INTEGRATION_TYPE),
      isNull(integrations.deletedAt)
    ))
    .limit(1)

  let leadCriadoAgora = false
  let [lead] = await db
    .select({ id: leads.id, title: leads.title, phone: leads.phone })
    .from(leads)
    .where(and(eq(leads.organizationId, orgId), eq(leads.phone, phone), isNull(leads.deletedAt)))
    .limit(1)

  if (!lead) {
    const [firstStage] = await db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(and(eq(pipelineStages.organizationId, orgId), isNull(pipelineStages.deletedAt)))
      .orderBy(asc(pipelineStages.rank))
      .limit(1)

    try {
      const [novo] = await db
        .insert(leads)
        .values({
          organizationId: orgId,
          // Em fromMe o senderName é o dono do WhatsApp, não o contato — aí o
          // telefone é o único nome honesto que temos.
          title: isFromMe ? phone : (senderName || phone),
          phone,
          integrationId: integration?.id || null,
          stageId: firstStage?.id || null,
          lastActivityAt: new Date(),
        })
        .returning({ id: leads.id, title: leads.title, phone: leads.phone })
      lead = novo
      leadCriadoAgora = true

      // Foto de perfil só na criação: rebuscar a cada mensagem gastaria uma
      // requisição por mensagem pra um dado que quase nunca muda.
      const foto = body?.senderPhoto || body?.photo
      if (foto && typeof foto === 'string') {
        const hospedada = await rehospedarFotoPerfil(orgId, foto, phone)
        if (hospedada) await db.update(leads).set({ avatarUrl: hospedada }).where(eq(leads.id, lead.id))
      }
    } catch (err) {
      // Duas mensagens quase simultâneas do mesmo número correm o SELECT acima
      // antes de qualquer INSERT commitar. A constraint leads_org_phone_unique
      // deixa só uma passar; a outra recupera o lead que venceu.
      if (!isUniqueViolation(err)) throw err
      const [existente] = await db
        .select({ id: leads.id, title: leads.title, phone: leads.phone })
        .from(leads)
        .where(and(eq(leads.organizationId, orgId), eq(leads.phone, phone), isNull(leads.deletedAt)))
        .limit(1)
      if (!existente) throw err
      lead = existente
    }
  }

  if (messageId) {
    const recentes = await db
      .select({ id: leadActivities.id, metadata: leadActivities.metadata })
      .from(leadActivities)
      .where(and(eq(leadActivities.organizationId, orgId), eq(leadActivities.leadId, lead.id)))
      .limit(100)
    const duplicada = recentes.find((a: any) => a.metadata?.zapi_message_id === messageId)
    if (duplicada) return { status: 'skipped', reason: 'duplicate' }
  }

  let midiaUrl: string | undefined
  let midiaMime: string | undefined
  if (extraido.mediaUrl && messageId) {
    const hospedada = await rehospedarMidiaZapi(orgId, extraido.mediaUrl, messageId)
    if (hospedada) {
      midiaUrl = hospedada.url
      midiaMime = hospedada.mimetype || extraido.mediaMimetype
    } else {
      // Não conseguiu re-hospedar: usa a original mesmo sabendo que ela expira em
      // 30 dias. Um link temporário é melhor que nenhum — sem isso a mensagem
      // apareceria só como rótulo de texto e a foto se perderia agora, não em 30 dias.
      midiaUrl = extraido.mediaUrl
      midiaMime = extraido.mediaMimetype
    }
  }

  const metadata: Record<string, any> = {
    source: 'zapi',
    direction: isFromMe ? 'outbound' : 'inbound',
    zapi_message_id: messageId,
  }
  if (!isFromMe) metadata.sender_name = senderName
  if (midiaUrl) metadata.media_url = midiaUrl
  if (extraido.mediaType) metadata.media_type = extraido.mediaType
  if (midiaMime) metadata.media_mimetype = midiaMime
  if (extraido.mediaFilename) metadata.media_filename = extraido.mediaFilename
  if (extraido.audioSeconds !== undefined) metadata.audio_seconds = extraido.audioSeconds

  // `momment` vem em milissegundos. Preserva o horário real: webhook reenviado
  // com atraso não pode pular pro topo da conversa como se fosse de agora.
  const momentoMs = typeof body?.momment === 'number' ? body.momment : undefined

  let activity: { id: string }
  try {
    ;[activity] = await db
      .insert(leadActivities)
      .values({
        organizationId: orgId,
        leadId: lead.id,
        type: 'whatsapp',
        content: extraido.text,
        metadata,
        ...(momentoMs ? { createdAt: new Date(momentoMs) } : {}),
      })
      .returning({ id: leadActivities.id })
  } catch (err) {
    // Rede de segurança do índice único global — o dedupe acima só olha as 100
    // últimas atividades DESTE lead.
    if (!isUniqueViolation(err)) throw err
    return { status: 'skipped', reason: 'duplicate' }
  }

  const leadUpdates: Record<string, any> = {
    lastMessageContent: extraido.text,
    lastMessageSenderType: isFromMe ? 'human' : 'lead',
    lastActivityAt: new Date(),
    lastActivityType: 'whatsapp',
    isUnread: !isFromMe,
    ...(!isFromMe ? { isArchived: false } : {}),
    integrationId: integration?.id || null,
  }
  if (!isFromMe) {
    leadUpdates.title = lead.title === lead.phone ? senderName : lead.title
  } else {
    // Respondeu pelo celular: o lead está sendo atendido por gente, e a etapa
    // acompanha — mesma regra que já vale pra Evolution.
    const [stage] = await db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(and(
        eq(pipelineStages.organizationId, orgId),
        isNull(pipelineStages.deletedAt),
        ilike(pipelineStages.name, 'Em atendimento')
      ))
      .limit(1)
    if (stage) leadUpdates.stageId = stage.id
  }

  await db.update(leads).set(leadUpdates).where(eq(leads.id, lead.id))

  await publishEvent(channels.leadActivities(lead.id), events.ACTIVITY_CREATED, { id: activity.id })
  if (leadCriadoAgora) {
    await publishEvent(channels.orgLeads(orgId), events.LEAD_CREATED, { id: lead.id })
  }
  await publishEvent(channels.orgLeads(orgId), events.LEAD_UPDATED, { id: lead.id })

  if (!isFromMe) {
    after(() => notifyInboundMessage(orgId, lead.id, { text: extraido.text, mediaType: extraido.mediaType }))
  }

  await dispatchOutboundWebhook(orgId, {
    leadId: lead.id,
    phone,
    fromMe: isFromMe,
    isGroup: false,
    chatLid: null,
    senderName: isFromMe ? null : senderName,
    chatName: lead.title,
    content: extraido.text,
    messageId: messageId || '',
    timestamp: momentoMs ?? Date.now(),
    instanceId: body?.instanceId || integration?.id || null,
    connectedPhone: body?.connectedPhone ? String(body.connectedPhone).replace(/\D/g, '') : null,
    mediaType: extraido.mediaType as any,
    mediaUrl: midiaUrl,
    mediaMimetype: midiaMime,
    mediaFilename: extraido.mediaFilename,
    audioSeconds: extraido.audioSeconds,
  })

  return { status: 'created', activityId: activity.id }
}
