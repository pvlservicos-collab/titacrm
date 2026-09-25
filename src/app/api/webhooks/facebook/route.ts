/**
 * POST/GET /api/webhooks/facebook
 * Webhook para receber mensagens da API Oficial do Facebook/WhatsApp Cloud
 *
 * GET  → Verificação do webhook pelo Facebook (hub.challenge)
 * POST → Receber mensagens inbound (assinatura conferida, JSON cru gravado em
 *        meta_webhook_events, 200 na hora, processamento no after())
 *
 * Configure no Facebook Developers:
 *   URL: https://pedrovictorweb.com.br/crm/api/webhooks/facebook (uma so pra todos os clientes)
 *   Verify Token: valor de FACEBOOK_WEBHOOK_VERIFY_TOKEN
 *
 * Variáveis: FACEBOOK_WEBHOOK_VERIFY_TOKEN, FACEBOOK_APP_SECRET (e
 * INSTAGRAM_APP_SECRET, se o Instagram for outro app), META_WEBHOOK_ATIVO=sim.
 */
import { GRAPH_VERSION } from '@/lib/meta'
import { NextRequest, after } from 'next/server'
import { conferirAssinatura, segredosDoApp } from '@/lib/meta-signature'
import { db } from '@/lib/db'
import { leads, leadActivities, pipelineStages, integrationMessageLogs, integrations, metaWebhookEvents } from '@/lib/schema'
import { eq, and, isNull, ilike, asc, sql } from 'drizzle-orm'
import { publishEvent, channels, events } from '@/lib/realtime'
import { dispatchOutboundWebhook } from '@/lib/outbound-webhook'
import { ORGANIZATION_ID } from '@/lib/automated-message'
import { isUniqueViolation } from '@/lib/db-helpers'
import { notifyInboundMessage } from '@/lib/push'
import { CAMPOS_COEXISTENCIA, processarCampoCoexistencia } from '@/lib/coexistencia'

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

  const apiVersion = config?.graph_api_version || GRAPH_VERSION
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

      const { getInstagramUserProfile } = await import('@/lib/instagram')
      const profile = await getInstagramUserProfile(orgId, integration.id, senderId)

      try {
        const [newLead] = await db.insert(leads).values({
          organizationId: orgId,
          integrationId: integration.id,
          title: profile?.name || senderId,
          externalId: senderId,
          avatarUrl: profile?.profilePic || null,
          customAttributes: profile?.username ? { instagram_username: profile.username } : {},
          stageId: firstStage?.id || null,
          lastActivityAt: new Date(),
        }).returning({ id: leads.id })
        leadId = newLead.id
      } catch (err) {
        // Mesma race condition do WhatsApp: duas mensagens quase simultâneas do mesmo
        // IGSID, cada uma criava seu próprio lead sem constraint. Agora
        // leads_integration_external_id_unique garante que só uma vence.
        if (!isUniqueViolation(err)) throw err
        const [raceLead] = await db.select({ id: leads.id }).from(leads)
          .where(and(eq(leads.organizationId, orgId), eq(leads.integrationId, integration.id), eq(leads.externalId, senderId), isNull(leads.deletedAt)))
          .limit(1)
        if (!raceLead) throw err
        leadId = raceLead.id
      }
    }

    let activity: { id: string }
    try {
      ;[activity] = await db.insert(leadActivities).values({
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
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      return Response.json({ status: 'ignored: duplicate message' })
    }

    await db.update(leads).set({
      lastMessageContent: content,
      lastMessageSenderType: 'lead',
      lastActivityAt: new Date(),
      isUnread: true,
      isArchived: false,
    }).where(eq(leads.id, leadId))

    await publishEvent(channels.leadActivities(leadId), events.ACTIVITY_CREATED, { id: activity.id })
    await publishEvent(channels.orgLeads(orgId), events.LEAD_UPDATED, { id: leadId })

    await notifyInboundMessage(orgId, leadId, { text: content, mediaType }).catch((e) => console.error('[Instagram Webhook] push', e))

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

/**
 * Confere o X-Hub-Signature-256: HMAC-SHA256 do corpo BRUTO com o App Secret.
 * Tem que ser sobre os bytes originais -- JSON re-serializado nunca bate.
 * Aceita o segredo do app da Meta e, se houver, o do app do Instagram (o
 * Instagram Login assina com o segredo do app dele). Sem nenhum segredo
 * configurado, recusa tudo: falha fechado.
 */
function assinaturaValida(bruto: string, cabecalho: string | null): boolean {
  /*
   * Confere pela lib do projeto (src/lib/meta-signature.ts), que aceita vários
   * segredos separados por vírgula — o Instagram com login próprio usa um app
   * diferente do WhatsApp e cada um assina com o seu.
   *
   * SEM segredo configurado, aceita e avisa no log, em vez de recusar: hoje o
   * Instagram Direct funciona em produção sem FACEBOOK_APP_SECRET, e recusar
   * tudo derrubaria o recebimento no primeiro deploy. Assim que o segredo
   * entrar, a conferência passa a valer e assinatura errada é recusada.
   */
  const segredos = [...segredosDoApp(), ...segredosDoApp(process.env.INSTAGRAM_APP_SECRET)]
  const resultado = conferirAssinatura(bruto, cabecalho, segredos)
  if (resultado === 'sem-segredo') {
    console.warn('[Facebook Webhook] sem FACEBOOK_APP_SECRET — aceitando sem conferir a assinatura')
    return true
  }
  return resultado === 'valida'
}

/**
 * Interruptor de pausa: só para de processar com META_WEBHOOK_ATIVO=nao.
 *
 * Invertido em relação ao kit de origem (lá, ausente = pausado) porque aqui o
 * recebimento já está no ar: se a ausência pausasse, o deploy pararia de
 * registrar mensagem do Instagram e da API Oficial sem ninguém perceber — os
 * eventos ficariam empilhados como "pausado". Pausar é uma decisão explícita.
 */
function webhookAtivo(): boolean {
  return process.env.META_WEBHOOK_ATIVO !== 'nao'
}

/**
 * POST da Meta. Regra: 200 em menos de 5s, sempre -- se demorar ou der erro a
 * Meta reenvia e tudo chega duplicado. Entao aqui so confere a assinatura,
 * grava o JSON cru e responde; a interpretacao roda no after(), fora da
 * requisicao, e anota o resultado em meta_webhook_events.
 */
export async function POST(req: NextRequest) {
  const bruto = await req.text()
  if (!assinaturaValida(bruto, req.headers.get('x-hub-signature-256'))) {
    console.warn('[Facebook Webhook] assinatura invalida ou FACEBOOK_APP_SECRET ausente')
    return new Response('Forbidden', { status: 403 })
  }

  let body: any
  try {
    body = JSON.parse(bruto)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const ativo = webhookAtivo()
  // Se nem gravar der, 500 de proposito: a Meta reenvia e o evento nao se perde.
  const [evento] = await db.insert(metaWebhookEvents).values({
    object: typeof body?.object === 'string' ? body.object : null,
    payload: body,
    status: ativo ? 'pendente' : 'pausado',
  }).returning({ id: metaWebhookEvents.id })

  if (ativo) {
    const orgIdDaUrl = req.nextUrl.searchParams.get('org_id')
    after(() => processarEvento(evento.id, body, orgIdDaUrl))
  }

  return new Response('EVENT_RECEIVED', { status: 200 })
}

/**
 * Percorre o lote inteiro: a Meta pode juntar varias entries, changes e
 * mensagens num POST so (antes so a primeira de cada era lida). Um erro numa
 * mensagem nao derruba as outras; o resumo fica no proprio evento.
 */
async function processarEvento(eventoId: string, body: any, orgIdDaUrl: string | null) {
  const resultados: string[] = []
  const erros: string[] = []

  for (const entry of body?.entry || []) {
    try {
      // Instagram Messaging usa `entry.messaging[]`, ausente nos payloads do
      // WhatsApp Cloud API -- discrimina os dois formatos antes de seguir.
      if (entry?.messaging?.length) {
        await handleInstagramEntry(entry)
        resultados.push('instagram')
        continue
      }
      for (const change of entry?.changes || []) {
        const value = change?.value
        // Coexistência (número também no aplicativo WhatsApp Business): eco das
        // mensagens mandadas pelo celular, histórico e contatos. Ver lib/coexistencia.
        if ((CAMPOS_COEXISTENCIA as readonly string[]).includes(change?.field)) {
          const orgId = await organizacaoDoEvento(value?.metadata?.phone_number_id, entry?.id) ?? orgIdDaUrl
          if (!orgId) { resultados.push(`${change.field}: organizacao nao encontrada`); continue }
          try {
            resultados.push((await processarCampoCoexistencia(orgId, change)) || change.field)
          } catch (err: any) {
            console.error('[Facebook Webhook] coexistencia', err)
            erros.push(`${change.field}: ${err?.message || err}`)
          }
          continue
        }
        if (change?.field === 'message_template_status_update') {
          resultados.push(`template ${value?.message_template_name || ''} ${value?.event || ''}`.trim())
          continue
        }
        const mensagens = value?.messages || []
        // Atualizacao de status (entregue/lida) fica so no JSON cru por enquanto.
        if (!mensagens.length) resultados.push(value?.statuses?.length ? 'status' : 'ignorado: sem mensagem')
        for (const message of mensagens) {
          try {
            resultados.push(await processarMensagemWhatsapp(body, entry, value, message, orgIdDaUrl))
          } catch (err: any) {
            console.error('[Facebook Webhook]', err)
            erros.push(`${message?.id || '?'}: ${err?.message || err}`)
          }
        }
      }
    } catch (err: any) {
      console.error('[Facebook Webhook]', err)
      erros.push(err?.message || String(err))
    }
  }

  await db.update(metaWebhookEvents).set({
    status: erros.length ? 'erro' : 'processado',
    processedAt: new Date(),
    error: erros.length ? erros.join(' | ') : resultados.join(', ') || null,
  }).where(eq(metaWebhookEvents.id, eventoId)).catch((e) => console.error('[Facebook Webhook] anotar evento', e))
}

/** Organizacao dona do numero/WABA do evento, pela integracao da API Oficial. */
async function organizacaoDoEvento(phoneNumberId?: string, wabaId?: string): Promise<string | null> {
  for (const [campo, valor] of [['phone_number_id', phoneNumberId], ['waba_id', wabaId]] as const) {
    if (!valor) continue
    const [achou] = await db.select({ organizationId: integrations.organizationId })
      .from(integrations)
      .where(and(
        eq(integrations.type, 'whatsapp_cloud_official'),
        isNull(integrations.deletedAt),
        sql`${integrations.config}->>${campo} = ${String(valor)}`,
      ))
      .limit(1)
    if (achou) return achou.organizationId
  }
  return null
}

async function processarMensagemWhatsapp(body: any, entry: any, value: any, message: any, orgIdDaUrl: string | null): Promise<string> {
  // De qual cliente e a mensagem? A Meta tem UMA URL de webhook por app, pra
  // todos os clientes do Tech Provider, entao quem decide e o payload: primeiro
  // o numero (phone_number_id), depois a WABA (entry.id). O ?org_id da URL e
  // legado e so vale se nenhum dos dois bater -- se viesse primeiro, a mensagem
  // de um cliente cairia na organizacao que estivesse na URL.
  const orgId = await organizacaoDoEvento(value?.metadata?.phone_number_id, entry?.id) ?? orgIdDaUrl

  if (!orgId) return 'ignorado: organizacao nao encontrada'

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

  // O lead fica ligado a esta integração: é por ela que a resposta do chat sai.
  // Sem isso o lead ficava sem canal, e lead sem canal responde pela Z-API
  // (ver api/leads/[id]/messages) -- a conversa chegava pela API Oficial e a
  // resposta saía por outro número, ou falhava.
  const [cloud] = await db.select({ id: integrations.id }).from(integrations)
    .where(and(eq(integrations.organizationId, orgId), eq(integrations.type, 'whatsapp_cloud_official'), isNull(integrations.deletedAt)))
    .limit(1)

  // Buscar ou criar lead
  const [existing] = await db.select({ id: leads.id, integrationId: leads.integrationId }).from(leads)
    .where(and(eq(leads.organizationId, orgId), ilike(leads.phone, `%${phone}%`), isNull(leads.deletedAt)))
    .limit(1)

  /*
   * Quem escreve pela API Oficial passa a ser um lead da API Oficial — também o
   * que estava preso ao número antigo (Z-API, desligado). Sem isso a conversa
   * chegava, mas ficava com a tag "Z-API" fora da aba oficial, e a resposta do
   * chat tentava sair por um número que não existe mais.
   */
  if (existing && cloud && existing.integrationId !== cloud.id) {
    let trocaDeCanal = !existing.integrationId
    if (existing.integrationId) {
      const [atual] = await db.select({ type: integrations.type }).from(integrations)
        .where(eq(integrations.id, existing.integrationId)).limit(1)
      trocaDeCanal = atual?.type === 'whatsapp_zapi'
    }
    if (trocaDeCanal) {
      await db.update(leads).set({ integrationId: cloud.id }).where(eq(leads.id, existing.id))
    }
  }

  let leadId = existing?.id
  if (!leadId) {
    const [firstStage] = await db.select({ id: pipelineStages.id }).from(pipelineStages)
      .where(and(eq(pipelineStages.organizationId, orgId), isNull(pipelineStages.deletedAt)))
      .orderBy(asc(pipelineStages.rank)).limit(1)

    try {
      const [newLead] = await db.insert(leads).values({
        organizationId: orgId,
        title: senderName,
        phone,
        stageId: firstStage?.id || null,
        integrationId: cloud?.id ?? null,
        lastActivityAt: new Date(),
      }).returning({ id: leads.id })
      leadId = newLead.id
    } catch (err) {
      // Mesma race condition já vista no Evolution: duas mensagens quase simultâneas
      // pro mesmo telefone, cada uma cria seu próprio lead sem constraint. Agora a
      // constraint leads_org_phone_unique garante que só uma vence.
      if (!isUniqueViolation(err)) throw err
      const [raceLead] = await db.select({ id: leads.id }).from(leads)
        .where(and(eq(leads.organizationId, orgId), eq(leads.phone, phone), isNull(leads.deletedAt)))
        .limit(1)
      if (!raceLead) throw err
      leadId = raceLead.id
    }
  }

  let activity: { id: string }
  try {
    ;[activity] = await db.insert(leadActivities).values({
      organizationId: orgId,
      leadId,
      type: 'whatsapp',
      content,
      metadata: {
        direction: isOutboundEcho ? 'outbound' : 'inbound',
        source: isOutboundEcho ? 'whatsapp_app' : 'facebook_cloud',
        sender_name: senderName,
        ...(message.id ? { whatsapp_message_id: message.id } : {}),
        ...(mediaUrl ? { media_url: mediaUrl, media_type: mediaType, media_mimetype: mediaMimetype, ...(mediaFilename ? { media_filename: mediaFilename } : {}) } : {}),
      },
    }).returning({ id: leadActivities.id })
  } catch (err) {
    // Replay do webhook da Meta (oficialmente pode reenviar o mesmo evento) — antes
    // duplicava incondicionalmente, sem checagem nenhuma. A constraint
    // lead_activities_whatsapp_msgid_unique agora rejeita a segunda tentativa.
    if (!isUniqueViolation(err)) throw err
    return 'duplicada'
  }

  await db.update(leads).set({
    lastMessageContent: content,
    lastMessageSenderType: isOutboundEcho ? 'agent' : 'lead',
    lastActivityAt: new Date(),
    isUnread: !isOutboundEcho,
    // Mensagem nova do cliente desarquiva sozinha (igual WhatsApp) — eco de mensagem
    // que a própria empresa mandou não deve tirar do arquivo.
    ...(!isOutboundEcho ? { isArchived: false } : {}),
  }).where(eq(leads.id, leadId))

  await publishEvent(channels.leadActivities(leadId), events.ACTIVITY_CREATED, { id: activity.id })
  await publishEvent(channels.orgLeads(orgId), events.LEAD_UPDATED, { id: leadId })

  if (!isOutboundEcho) {
    // Ja estamos dentro do after() do POST: aguarda aqui mesmo.
    await notifyInboundMessage(orgId, leadId, { text: content, mediaType }).catch((e) => console.error('[Facebook Webhook] push', e))
  }

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

  return 'ok'
}
