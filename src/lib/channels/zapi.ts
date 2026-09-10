import { sendZapiMessage, sendZapiMedia, deleteZapiMessage } from '@/lib/zapi'
import type { ChannelAdapter } from './types'

/**
 * Z-API como canal do CRM.
 *
 * `supportsGroups: false` de propósito: a entrada (zapiInbound) descarta mensagem
 * de grupo, então não existe conversa de grupo vinda daqui pra responder. Marcar
 * true faria o CRM aceitar um envio que não tem destinatário do outro lado.
 */
export const zapiAdapter: ChannelAdapter = {
  metadataIdKey: 'zapi_message_id',
  supportsGroups: false,

  async sendText(organizationId, _integrationId, recipient, content) {
    const { data, telefone } = await sendZapiMessage(organizationId, recipient, content)
    return { externalId: data?.messageId || data?.id, raw: data, recipienteCorrigido: telefone }
  },

  async sendMedia(organizationId, _integrationId, recipient, mediaType, mediaUrl, caption, filename) {
    const { data, telefone } = await sendZapiMedia(organizationId, recipient, mediaType, mediaUrl, caption, filename)
    return { externalId: data?.messageId || data?.id, raw: data, recipienteCorrigido: telefone }
  },

  async deleteMessage(organizationId, _integrationId, recipient, externalMessageId) {
    await deleteZapiMessage(organizationId, recipient, externalMessageId, true)
  },
}
