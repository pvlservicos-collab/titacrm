import { db } from './db'
import { integrations, integrationSecrets } from './schema'
import { eq, and, isNull } from 'drizzle-orm'

async function getEvolutionCredentials(organizationId: string) {
  const [integration] = await db
    .select({ id: integrations.id, config: integrations.config })
    .from(integrations)
    .where(
      and(
        eq(integrations.organizationId, organizationId),
        eq(integrations.type, 'whatsapp_evolution'),
        isNull(integrations.deletedAt)
      )
    )
    .limit(1)

  if (!integration) throw new Error('Integração Evolution não configurada.')

  const [secretRow] = await db
    .select({ secret: integrationSecrets.secret })
    .from(integrationSecrets)
    .where(eq(integrationSecrets.integrationId, integration.id))
    .limit(1)

  const instanceName = (integration.config as any)?.instanceName
  const apiKey = (secretRow?.secret as any)?.api_key || process.env.EVOLUTION_API_KEY
  const server = process.env.EVOLUTION_API_URL

  if (!instanceName) throw new Error('Nome da instância Evolution não configurado.')
  if (!server) throw new Error('EVOLUTION_API_URL não configurada.')

  return { instanceName, apiKey, server }
}

/**
 * A URL que vem no payload do webhook (`msg.imageMessage.url` etc.) aponta pro CDN
 * criptografado do WhatsApp (`mmg.whatsapp.net/.../*.enc`) — só abre com a mediaKey,
 * que não temos aqui, e ainda expira em poucos dias. Por isso pedimos pra própria
 * Evolution API decriptar (ela tem a mediaKey da instância) e devolver em base64,
 * pra então re-hospedar num link estável no Blob — igual já fazemos com WhatsApp
 * Cloud API e Instagram.
 */
export async function downloadEvolutionMedia(organizationId: string, messageId: string): Promise<{ url: string; mimetype?: string } | null> {
  try {
    const { instanceName, apiKey, server } = await getEvolutionCredentials(organizationId)

    const res = await fetch(`${server}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
    })
    if (!res.ok) return null

    const data = await res.json().catch(() => null)
    const base64: string | undefined = data?.base64
    if (!base64) return null

    const mimetype = data?.mimetype || 'application/octet-stream'
    const buffer = Buffer.from(base64, 'base64')

    const { put } = await import('@vercel/blob')
    const ext = mimetype.split('/')[1]?.split(';')[0] || 'bin'
    const blob = await put(`evolution-media/${organizationId}/${messageId}.${ext}`, buffer, {
      access: 'public',
      contentType: mimetype,
    })

    return { url: blob.url, mimetype }
  } catch (err) {
    console.error('[Evolution] media download failed', err)
    return null
  }
}

/** Grupo precisa do JID completo (`<id>@g.us`); contato usa só os dígitos do telefone. */
function formatRecipient(phone: string, isGroup?: boolean) {
  const digits = phone.replace(/\D/g, '')
  return isGroup ? `${digits}@g.us` : digits
}

export async function sendEvolutionMessage(
  organizationId: string,
  phone: string,
  text: string,
  isGroup?: boolean
) {
  const { instanceName, apiKey, server } = await getEvolutionCredentials(organizationId)
  const formattedPhone = formatRecipient(phone, isGroup)

  const res = await fetch(`${server}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: formattedPhone, text }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Falha ao enviar mensagem via Evolution')
  return data
}

export async function sendEvolutionMedia(
  organizationId: string,
  phone: string,
  mediaType: string,
  mediaUrl: string,
  caption?: string,
  fileName?: string,
  isGroup?: boolean
) {
  const { instanceName, apiKey, server } = await getEvolutionCredentials(organizationId)
  const formattedPhone = formatRecipient(phone, isGroup)

  // Áudio (nota de voz) precisa do endpoint dedicado: é ele quem converte o arquivo de
  // origem (ex: .webm gravado no navegador) para o OGG/Opus que o WhatsApp exige pra tocar
  // como balão de áudio. O endpoint genérico de mídia abaixo aceita a chamada e retorna
  // sucesso, mas a mensagem não chega tocável no destinatário quando o arquivo não é
  // ogg/opus — foi exatamente isso que aconteceu com os áudios gravados pelo app.
  if (mediaType === 'audio') {
    const res = await fetch(`${server}/message/sendWhatsAppAudio/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: formattedPhone, audio: mediaUrl }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Falha ao enviar áudio via Evolution')
    return data
  }

  const evoMediaType =
    mediaType === 'image' ? 'image' :
    mediaType === 'video' ? 'video' : 'document'

  const res = await fetch(`${server}/message/sendMedia/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({
      number: formattedPhone,
      mediatype: evoMediaType,
      media: mediaUrl,
      caption: caption || '',
      fileName: fileName || '',
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Falha ao enviar mídia via Evolution')
  return data
}
