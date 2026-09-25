import { sendEvolutionMessage, sendEvolutionMedia, deleteEvolutionMessage } from '@/lib/evolution'
import type { ChannelAdapter } from './types'

/*
 * REGRA: os números da Evolution (Michele, Augusto, Cau) são só pra OBSERVAR e
 * RESPONDER À MÃO pelo CRM. Nada automático sai por eles — funil, disparo, IA,
 * API de terceiros. Este adapter só é alcançado por getChannelAdapter (resposta
 * manual, e a rota que o chama exige uma pessoa logada); getAutomationAdapter
 * nunca o devolve. Ver CLAUDE.md.
 */
export const evolutionAdapter: ChannelAdapter = {
  metadataIdKey: 'evolution_message_id',
  supportsGroups: true,

  async sendText(organizationId, integrationId, recipient, content, isGroup) {
    const result = await sendEvolutionMessage(organizationId, recipient, content, isGroup, integrationId)
    return { externalId: result?.key?.id, raw: result }
  },

  async sendMedia(organizationId, integrationId, recipient, mediaType, mediaUrl, caption, filename, isGroup) {
    const result = await sendEvolutionMedia(organizationId, recipient, mediaType, mediaUrl, caption, filename, isGroup, integrationId)
    return { externalId: result?.key?.id, raw: result }
  },

  async deleteMessage(organizationId, integrationId, recipient, externalMessageId, isGroup) {
    await deleteEvolutionMessage(organizationId, recipient, externalMessageId, isGroup, integrationId)
  },
}
