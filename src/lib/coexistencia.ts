/**
 * Coexistência: número que continua no aplicativo WhatsApp Business do celular
 * e, ao mesmo tempo, na API Oficial (Embedded Signup com
 * featureType: 'whatsapp_business_app_onboarding').
 *
 * Diferenças para um número migrado:
 *  - NÃO se chama /register (o registro desfaria o vínculo com o aplicativo);
 *  - em até 24h depois de conectar, pede-se à Meta a sincronização dos
 *    contatos (smb_app_state_sync) e do histórico de conversas (history);
 *  - chegam três campos de webhook a mais, tratados aqui:
 *      smb_message_echoes  → mensagem que a empresa mandou PELO CELULAR
 *      history             → conversas antigas do aplicativo (em lotes)
 *      smb_app_state_sync  → contatos da agenda do aplicativo
 *
 * Tudo idempotente: mensagem pelo whatsapp_message_id (índice único) e
 * contato pelo telefone (leads_org_phone_unique). A Meta reenvia lotes.
 */
import { db } from '@/lib/db'
import { leads, leadActivities, integrations, pipelineStages } from '@/lib/schema'
import { and, asc, eq, ilike, isNull, sql } from 'drizzle-orm'
import { graphPost } from '@/lib/meta'
import { isUniqueViolation } from '@/lib/db-helpers'
import { publishEvent, channels, events } from '@/lib/realtime'

export const CAMPOS_COEXISTENCIA = ['smb_message_echoes', 'history', 'smb_app_state_sync'] as const

/** Pede à Meta a sincronização dos contatos ou do histórico do aplicativo. */
export const sincronizarAppBusiness = (phoneId: string, token: string, tipo: 'smb_app_state_sync' | 'history') =>
  graphPost(`/${phoneId}/smb_app_data`, token, { messaging_product: 'whatsapp', sync_type: tipo })

const ROTULO_MIDIA: Record<string, string> = {
  image: '📷 Imagem', video: '🎥 Vídeo', audio: '🎵 Áudio', document: '📄 Documento', sticker: '✨ Figurinha',
}

function textoDaMensagem(m: any): string {
  if (m?.text?.body) return m.text.body
  const midia = m?.[m?.type]
  if (midia?.caption) return midia.caption
  if (ROTULO_MIDIA[m?.type]) return ROTULO_MIDIA[m.type]
  if (m?.type === 'reaction') return `Reagiu: ${m.reaction?.emoji || '👍'}`
  if (m?.type === 'location') return `📍 Localização: ${m.location?.name || `${m.location?.latitude}, ${m.location?.longitude}`}`
  return `[${m?.type || 'mensagem'}]`
}

async function integracaoCloud(orgId: string) {
  const [i] = await db.select({ id: integrations.id }).from(integrations)
    .where(and(eq(integrations.organizationId, orgId), eq(integrations.type, 'whatsapp_cloud_official'), isNull(integrations.deletedAt)))
    .limit(1)
  return i?.id ?? null
}

/** Lead do telefone (cria se não existir), já ligado à API Oficial. */
async function leadDoTelefone(orgId: string, telefone: string, nome: string | null, integracaoId: string | null): Promise<string> {
  const phone = telefone.replace(/\D/g, '')
  const [existente] = await db.select({ id: leads.id, integrationId: leads.integrationId, title: leads.title }).from(leads)
    .where(and(eq(leads.organizationId, orgId), ilike(leads.phone, `%${phone}%`), isNull(leads.deletedAt)))
    .limit(1)
  if (existente) {
    const updates: Record<string, any> = {}
    if (!existente.integrationId && integracaoId) updates.integrationId = integracaoId
    // Contato da agenda dá nome a quem só tinha o número como título.
    if (nome && existente.title?.replace(/\D/g, '') === phone) updates.title = nome
    if (Object.keys(updates).length) await db.update(leads).set(updates).where(eq(leads.id, existente.id))
    return existente.id
  }
  const [etapa] = await db.select({ id: pipelineStages.id }).from(pipelineStages)
    .where(and(eq(pipelineStages.organizationId, orgId), isNull(pipelineStages.deletedAt)))
    .orderBy(asc(pipelineStages.rank)).limit(1)
  try {
    const [novo] = await db.insert(leads).values({
      organizationId: orgId, title: nome || phone, phone, stageId: etapa?.id || null, integrationId: integracaoId,
    }).returning({ id: leads.id })
    return novo.id
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const [corrida] = await db.select({ id: leads.id }).from(leads)
      .where(and(eq(leads.organizationId, orgId), eq(leads.phone, phone), isNull(leads.deletedAt))).limit(1)
    if (!corrida) throw err
    return corrida.id
  }
}

/**
 * Grava uma mensagem da coexistência na conversa. Devolve false se já existia.
 * `atualizarPrevia`: só a mensagem mais nova mexe na prévia da lista — um lote
 * de histórico antigo não pode passar por cima da última conversa real.
 */
async function gravarMensagem(orgId: string, leadId: string, m: any, direcao: 'inbound' | 'outbound', origem: string): Promise<boolean> {
  const quando = m?.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date()
  const conteudo = textoDaMensagem(m)
  try {
    await db.insert(leadActivities).values({
      organizationId: orgId,
      leadId,
      type: 'whatsapp',
      content: conteudo,
      createdAt: quando,
      metadata: {
        direction: direcao,
        source: origem,
        channel: 'whatsapp_cloud_official',
        ...(m?.id ? { whatsapp_message_id: m.id } : {}),
        ...(ROTULO_MIDIA[m?.type] ? { media_type: m.type } : {}),
      },
    })
  } catch (err) {
    if (isUniqueViolation(err)) return false
    throw err
  }
  // Prévia da lista só avança; mensagem de histórico mais antiga não volta ela.
  await db.update(leads).set({
    lastMessageContent: conteudo,
    lastMessageSenderType: direcao === 'outbound' ? 'agent' : 'lead',
    lastActivityAt: quando,
  }).where(and(eq(leads.id, leadId), sql`(${leads.lastActivityAt} IS NULL OR ${leads.lastActivityAt} <= ${quando})`))
  return true
}

/**
 * Processa um change de webhook da coexistência. Devolve o resumo pro evento
 * (meta_webhook_events.error) ou null se o campo não é de coexistência.
 */
export async function processarCampoCoexistencia(orgId: string, change: any): Promise<string | null> {
  const campo = change?.field
  const v = change?.value || {}
  if (!CAMPOS_COEXISTENCIA.includes(campo)) return null
  const integracaoId = await integracaoCloud(orgId)
  const numeroDaEmpresa = String(v.metadata?.display_phone_number || '').replace(/\D/g, '')
  const tocados = new Set<string>()
  let gravadas = 0

  if (campo === 'smb_message_echoes') {
    // Mensagem que a empresa mandou pelo aplicativo do celular: vai pra conversa como enviada.
    for (const m of v.message_echoes || []) {
      if (!m?.to) continue
      const leadId = await leadDoTelefone(orgId, m.to, null, integracaoId)
      if (await gravarMensagem(orgId, leadId, m, 'outbound', 'whatsapp_app')) { gravadas++; tocados.add(leadId) }
    }
  } else if (campo === 'history') {
    // Conversas antigas, em lotes (metadata.phase/chunk_order/progress).
    for (const lote of v.history || []) {
      for (const conversa of lote.threads || []) {
        const cliente = String(conversa.id || '').replace(/\D/g, '')
        if (!cliente) continue
        const leadId = await leadDoTelefone(orgId, cliente, null, integracaoId)
        for (const m of conversa.messages || []) {
          const daEmpresa = String(m.from || '').replace(/\D/g, '') === numeroDaEmpresa
          if (await gravarMensagem(orgId, leadId, m, daEmpresa ? 'outbound' : 'inbound', 'whatsapp_app_history')) { gravadas++; tocados.add(leadId) }
        }
      }
    }
  } else if (campo === 'smb_app_state_sync') {
    // Contatos da agenda do aplicativo: viram leads (ou dão nome aos que já existem).
    for (const s of v.state_sync || []) {
      const c = s?.contact
      if (s?.type !== 'contact' || !c?.phone_number || s.action === 'remove') continue
      await leadDoTelefone(orgId, c.phone_number, c.full_name || c.first_name || null, integracaoId)
      gravadas++
    }
  }

  for (const leadId of tocados) await publishEvent(channels.leadActivities(leadId), events.ACTIVITY_CREATED, { id: leadId })
  if (tocados.size) await publishEvent(channels.orgLeads(orgId), events.LEAD_UPDATED, {})
  return `${campo}: ${gravadas}`
}
