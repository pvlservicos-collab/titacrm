import { sendEvolutionMessage, sendEvolutionMedia } from '@/lib/evolution'
import type { ChannelAdapter } from './types'

export const evolutionAdapter: ChannelAdapter = {
  metadataIdKey: 'evolution_message_id',
  supportsGroups: true,

  async sendText(organizationId, recipient, content, isGroup) {
    const result = await sendEvolutionMessage(organizationId, recipient, content, isGroup)
    return { externalId: result?.key?.id, raw: result }
  },

  async sendMedia(organizationId, recipient, mediaType, mediaUrl, caption, filename, isGroup) {
    const result = await sendEvolutionMedia(organizationId, recipient, mediaType, mediaUrl, caption, filename, isGroup)
    return { externalId: result?.key?.id, raw: result }
  },
}
