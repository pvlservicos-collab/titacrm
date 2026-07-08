/**
 * POST/GET /api/webhooks/facebook
 * Webhook para receber mensagens da API Oficial do Facebook/WhatsApp Cloud
 *
 * GET  → Verificação do webhook pelo Facebook (hub.challenge)
 * POST → Receber mensagens inbound
 *
 * Configure no Facebook Developers:
 *   URL: https://seu-app.vercel.app/api/webhooks/facebook?org_id=SEU_ORG_ID
 *   Verify Token: valor de FACEBOOK_WEBHOOK_VERIFY_TOKEN
 */
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { leads, leadActivities, pipelineStages, integrationMessageLogs, integrations } from '@/lib/schema'
import { eq, and, isNull, ilike, asc, sql } from 'drizzle-orm'
import { publishEvent, channels, events } from '@/lib/realtime'
import { dispatchOutboundWebhook } from '@/lib/outbound-webhook'
import { ORGANIZATION_ID } from '@/lib/automated-message'
import {
  FIGURINHA_BUSCANDO_MESSAGE,
  FIGURINHA_READY_TEST_NUMBERS,
  buildFigurinhaFlowPreviewMessages,
  extractFigurinhaNumero,
  runFigurinhaFunnel,
  sendFigurinhaAutoMessage,
} from '@/lib/figurinha'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

/**
 * Baixa uma mídia do WhatsApp Cloud API e armazena no Vercel Blob.
 * Retorna a URL pública e o mimetype, ou null se não foi possível.
 */
async function downloadWhatsappMedia(orgId: string, mediaId: string): Promise<{ url: string; mimetype?: string } | null> {
  const { integrations, integrationSecrets } = await import('@/lib/schema')

  const [integration] = await db.select({ id: integrations.id, config: integrations.config })
    .from(integrations)
    .where(and(eq(integrations.organizationId, orgId), eq(integrations.type, 'whatsapp_cloud_official'), isNull(integrations.deletedAt)))
    .limit(1)
  if (!integration) return null

  const [secretRow] = await db.select({ secret: integrationSecrets.secret })
    .from(integrationSecrets)
    .where(eq(integrationSecrets.integrationId, integration.id))
    .limit(1)

  const config = integration.config as { graph_api_version?: string }
  const secret = secretRow?.secret as { system_token?: string } | undefined
  if (!secret?.system_token) return null

  const apiVersion = config?.graph_api_version || 'v21.0'
  const token = secret.system_token

  const metaRes = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaRes.ok) return null
  const meta = await metaRes.json()
  if (!meta?.url) return null

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!fileRes.ok) return null
  const buffer = Buffer.from(await fileRes.arrayBuffer())

  const { put } = await import('@vercel/blob')
  const ext = (meta.mime_type || '').split('/')[1]?.split(';')[0] || 'bin'
  const blob = await put(`whatsapp-media/${orgId}/${mediaId}.${ext}`, buffer, {
    access: 'public',
    contentType: meta.mime_type || 'application/octet-stream',
  })

  return { url: blob.url, mimetype: meta.mime_type }
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const
const MEDIA_LABELS: Record<string, string> = {
  image: '📷 Imagem',
  video: '🎥 Vídeo',
  audio: '🎵 Áudio',
  document: '📄 Documento',
  sticker: '✨ Figurinha',
}

// ── Instagram Direct ────────────────────────────────────────────────────────
// entry.id em eventos de Instagram Messaging é o ID do objeto assinado no
// webhook (IG Business Account ou a Page conectada, dependendo de como a
// assinatura foi configurada) — testamos os dois campos salvos na integração.
async function findInstagramIntegration(entryId: string) {
  const [integration] = await db.select({ id: integrations.id, organizationId: integrations.organizationId })
    .from(integrations)
    .where(and(
      eq(integrations.type, 'instagram_direct'),
      isNull(integrations.deletedAt),
      sql`(${integrations.config}->>'instagram_business_account_id' = ${entryId} OR ${integrations.config}->>'connected_page_id' = ${entryId})`
    ))
    .limit(1)
  return integration
}

async function downloadInstagramMedia(orgId: string, url: string, mediaType: string): Promise<string | null> {
  try {
    const fileRes = await fetch(url)
    if (!fileRes.ok) return null
    const buffer = Buffer.from(await fileRes.arrayBuffer())
    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
    const ext = contentType.split('/')[1]?.split(';')[0] || 'bin'

    const { put } = await import('@vercel/blob')
    const blob = await put(`instagram-media/${orgId}/${mediaType}-${Date.now()}.${ext}`, buffer, {
      access: 'public',
      contentType,
    })
    return blob.url
  } catch (err) {
    console.error('[Instagram Webhook] media download failed', err)
    return null
  }
}

// share/ig_reel/story_mention: conteúdo compartilhado de dentro do Instagram
// (Reels, posts, menção em story). A Meta não inclui uma URL baixável pra esses
// tipos no payload do webhook — só um id de referência (ex: reel_video_id) que a
// Graph API não expõe pra download. Por isso não tem mídia re-hospedada pra eles,
// só o rótulo — não é um bug do parsing, é limitação da própria API da Meta.
const IG_MEDIA_LABELS: Record<string, string> = {
  image: '📷 Imagem',
  video: '🎥 Vídeo',
  audio: '🎵 Áudio',
  file: '📄 Documento',
  share: '🔗 Publicação compartilhada (sem prévia — Meta não envia o link)',
  ig_reel: '🎬 Reels compartilhado (sem prévia — Meta não envia o vídeo original)',
  story_mention: '📸 Menção em story (sem prévia — Meta não envia a imagem)',
}

/**
 * Instagram Messaging entrega eventos no formato `entry.messaging[]` (padrão
 * Messenger Platform) — diferente do `entry.changes[].value.messages[]` do
 * WhatsApp Cloud API. Validado contra payloads reais em 2026-07-08 (texto e
 * anexo tipo ig_reel) — os dois formatos batem com o parsing abaixo.
 */
async function handleInstagramEntry(entry: any) {
  const integration = await findInstagramIntegration(entry.id)
  if (!integration) return Response.json({ status: 'ignored: instagram integration not found' })

  const orgId = integration.organizationId

  for (const evt of entry.messaging || []) {
    const message = evt.message
    if (!message) continue

    // Mensagens ecoadas (enviadas pela própria Page — seja pela nossa API, seja
    // manualmente pelo app do Instagram) são ignoradas aqui: o envio pela nossa
    // API já grava a activity no momento do envio, então tratar o echo duplicaria
    // a mensagem. Consequência: mensagem enviada manualmente fora do CRM não
    // sincroniza automaticamente nesta v1.
    if (message.is_echo) continue

    const senderId = evt.sender?.id
    if (!senderId) continue

    let content = message.text || ''
    let mediaUrl: string | undefined
    let mediaType: string | undefined

    const attachment = message.attachments?.[0]
    if (attachment?.type) {
      mediaType = attachment.type === 'file' ? 'document' : attachment.type
      const rawUrl = attachment.payload?.url
      if (rawUrl) {
        const hosted = await downloadInstagramMedia(orgId, rawUrl, mediaType || 'file')
        if (hosted) mediaUrl = hosted
      }
      if (!content) content = IG_MEDIA_LABELS[attachment.type] || '[Mídia recebida]'
    } else if (!content) {
      content = '[Mensagem recebida]'
    }

    // Instagram não tem telefone — lead é resolvido por external_id (IGSID) +
    // integração, não por phone como no WhatsApp.
    const [existing] = await db.select({ id: leads.id }).from(leads)
      .where(and(
        eq(leads.organizationId, orgId),
        eq(leads.integrationId, integration.id),
        eq(leads.externalId, senderId),
        isNull(leads.deletedAt)
      ))
      .limit(1)

    let leadId = existing?.id
    if (!leadId) {
      const [firstStage] = await db.select({ id: pipelineStages.id }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, orgId), isNull(pipelineStages.deletedAt)))
        .orderBy(asc(pipelineStages.rank)).limit(1)

      const [newLead] = await db.insert(leads).values({
        organizationId: orgId,
        integrationId: integration.id,
        title: senderId,
        externalId: senderId,
        stageId: firstStage?.id || null,
        lastActivityAt: new Date(),
      }).returning({ id: leads.id })
      leadId = newLead.id
    }

    const [activity] = await db.insert(leadActivities).values({
      organizationId: orgId,
      leadId,
      type: 'whatsapp',
      content,
      metadata: {
        direction: 'inbound',
        source: 'instagram',
        channel: 'instagram_direct',
        instagram_message_id: message.mid,
        ...(mediaUrl ? { media_url: mediaUrl, media_type: mediaType } : {}),
      },
    }).returning({ id: leadActivities.id })

    await db.update(leads).set({
      lastMessageContent: content,
      lastMessageSenderType: 'lead',
      lastActivityAt: new Date(),
      isUnread: true,
    }).where(eq(leads.id, leadId))

    await publishEvent(channels.leadActivities(leadId), events.ACTIVITY_CREATED, { id: activity.id })
    await publishEvent(channels.orgLeads(orgId), events.LEAD_UPDATED, { id: leadId })

    await db.insert(integrationMessageLogs).values({
      organizationId: orgId,
      source: 'instagram',
      direction: 'inbound',
      content,
      leadId,
      status: 'success',
      payload: evt,
    })
  }

  return Response.json({ status: 'ok' })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const entry = body.entry?.[0]

    // Instagram Messaging usa `entry.messaging[]`, ausente nos payloads do
    // WhatsApp Cloud API — discrimina os dois formatos antes de seguir.
    if (entry?.messaging?.length) {
      return await handleInstagramEntry(entry)
    }

    const changes = entry?.changes?.[0]
    const value = changes?.value
    const message = value?.messages?.[0]

    if (!message) return Response.json({ status: 'ignored: no message' })

    // Resolve org_id: URL param (legado) ou via WABA ID no payload
    let orgId = new URL(req.url).searchParams.get('org_id')
    if (!orgId) {
      const wabaId = entry?.id as string | undefined
      if (wabaId) {
        const { integrations } = await import('@/lib/schema')
        const { sql } = await import('drizzle-orm')
        const [found] = await db.select({ organizationId: integrations.organizationId })
          .from(integrations)
          .where(sql`${integrations.config}->>'waba_id' = ${wabaId}`)
          .limit(1)
        orgId = found?.organizationId ?? null
      }
    }

    if (!orgId) return Response.json({ status: 'ignored: org not found' })

    // Detecta "echo" de mensagem enviada pelo próprio número (ex: enviada via app oficial do WhatsApp)
    const ownNumber = (value?.metadata?.display_phone_number || '').replace(/\D/g, '')
    const fromNumber = (message.from || '').replace(/\D/g, '')
    const isOutboundEcho = !!ownNumber && ownNumber === fromNumber

    const phone = isOutboundEcho ? (value?.contacts?.[0]?.wa_id || message.from) : message.from
    const senderName = value?.contacts?.[0]?.profile?.name || phone

    // Mídia (imagem, áudio, vídeo, documento, figurinha)
    let mediaUrl: string | undefined
    let mediaType: string | undefined
    let mediaMimetype: string | undefined
    let mediaFilename: string | undefined
    let content = message.text?.body || ''

    if ((MEDIA_TYPES as readonly string[]).includes(message.type)) {
      mediaType = message.type
      const mediaObj = message[message.type]
      mediaMimetype = mediaObj?.mime_type
      mediaFilename = mediaObj?.filename
      if (mediaObj?.caption) content = mediaObj.caption

      if (mediaObj?.id) {
        try {
          const downloaded = await downloadWhatsappMedia(orgId, mediaObj.id)
          if (downloaded) {
            mediaUrl = downloaded.url
            mediaMimetype = downloaded.mimetype || mediaMimetype
          }
        } catch (err) {
          console.error('[Facebook Webhook] media download failed', err)
        }
      }

      if (!content) content = MEDIA_LABELS[message.type] || '[Mídia recebida]'
    } else if (message.type === 'button') {
      content = message.button?.text || message.button?.payload || '[Botão pressionado]'
    } else if (message.type === 'interactive') {
      content =
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        '[Resposta interativa]'
    } else if (message.type === 'reaction') {
      content = `Reagiu: ${message.reaction?.emoji || '👍'}`
    } else if (message.type === 'location') {
      const loc = message.location
      content = `📍 Localização: ${loc?.name || `${loc?.latitude}, ${loc?.longitude}`}`
    } else if (!content) {
      content = '[Mensagem recebida]'
    }

    // Buscar ou criar lead
    const [existing] = await db.select({ id: leads.id }).from(leads)
      .where(and(eq(leads.organizationId, orgId), ilike(leads.phone, `%${phone}%`), isNull(leads.deletedAt)))
      .limit(1)

    let leadId = existing?.id
    if (!leadId) {
      const [firstStage] = await db.select({ id: pipelineStages.id }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, orgId), isNull(pipelineStages.deletedAt)))
        .orderBy(asc(pipelineStages.rank)).limit(1)

      const [newLead] = await db.insert(leads).values({
        organizationId: orgId,
        title: senderName,
        phone,
        stageId: firstStage?.id || null,
        lastActivityAt: new Date(),
      }).returning({ id: leads.id })
      leadId = newLead.id
    }

    const [activity] = await db.insert(leadActivities).values({
      organizationId: orgId,
      leadId,
      type: 'whatsapp',
      content,
      metadata: {
        direction: isOutboundEcho ? 'outbound' : 'inbound',
        source: isOutboundEcho ? 'whatsapp_app' : 'facebook_cloud',
        sender_name: senderName,
        ...(mediaUrl ? { media_url: mediaUrl, media_type: mediaType, media_mimetype: mediaMimetype, ...(mediaFilename ? { media_filename: mediaFilename } : {}) } : {}),
      },
    }).returning({ id: leadActivities.id })

    await db.update(leads).set({
      lastMessageContent: content,
      lastMessageSenderType: isOutboundEcho ? 'agent' : 'lead',
      lastActivityAt: new Date(),
      isUnread: !isOutboundEcho,
    }).where(eq(leads.id, leadId))

    await publishEvent(channels.leadActivities(leadId), events.ACTIVITY_CREATED, { id: activity.id })
    await publishEvent(channels.orgLeads(orgId), events.LEAD_UPDATED, { id: leadId })

    await db.insert(integrationMessageLogs).values({
      organizationId: orgId,
      source: isOutboundEcho ? 'whatsapp_app' : 'facebook_cloud',
      direction: isOutboundEcho ? 'outbound' : 'inbound',
      phone,
      content,
      leadId,
      status: 'success',
      payload: body,
    })

    const momment = message.timestamp ? Number(message.timestamp) * 1000 : Date.now()

    await dispatchOutboundWebhook(orgId, {
      leadId,
      phone,
      fromMe: isOutboundEcho,
      isGroup: false,
      senderName: isOutboundEcho ? null : senderName,
      content,
      messageId: message.id || null,
      timestamp: momment,
      instanceId: value?.metadata?.phone_number_id || entry?.id || null,
      connectedPhone: ownNumber || null,
      mediaType: mediaType as any,
      mediaUrl,
      mediaMimetype,
      mediaFilename,
      audioPtt: message.type === 'audio' ? !!message.audio?.voice : undefined,
    })

    // Fluxo de figurinha: cliente pede "Quero minha figurinha Nº#..."
    if (!isOutboundEcho && orgId === ORGANIZATION_ID) {
      const numero = extractFigurinhaNumero(content)
      if (numero) {
        await runFigurinhaFunnel('pedido_figurinha', leadId, numero, () =>
          sendFigurinhaAutoMessage(leadId, phone, FIGURINHA_BUSCANDO_MESSAGE, 'geracaowhatsapp_buscando')
        )

        if (FIGURINHA_READY_TEST_NUMBERS.has(numero)) {
          // Número de teste/monitoramento: o fluxo único (pedido_figurinha →
          // geracaowhatsapp → abandono_preco) já cascateia automaticamente,
          // então só enviamos o log com todas as mensagens do fluxo, uma por
          // uma, exatamente como seriam enviadas ao cliente, só para uso interno.
          const previewMessages = await buildFigurinhaFlowPreviewMessages(numero, senderName)
          for (const message of previewMessages) {
            await sendFigurinhaAutoMessage(leadId, phone, message, 'geracaowhatsapp_log')
          }
        }
      }
    }

    return Response.json({ status: 'ok' })
  } catch (err: any) {
    console.error('[Facebook Webhook]', err)
    return Response.json({ status: 'error', message: err.message }, { status: 500 })
  }
}
