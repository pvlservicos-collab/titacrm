import { sendInstagramMessage, sendInstagramMedia } from '@/lib/instagram'
import type { ChannelAdapter } from './types'

export const instagramAdapter: ChannelAdapter = {
  metadataIdKey: 'instagram_message_id',
  supportsGroups: false,

  async sendText(organizationId, recipient, content) {
    const result = await sendInstagramMessage(organizationId, recipient, content)
    return { externalId: result?.message_id, raw: result }
  },

  async sendMedia(organizationId, recipient, mediaType, mediaUrl) {
    const result = await sendInstagramMedia(
      organizationId,
      recipient,
      mediaType as 'image' | 'video' | 'audio' | 'document' | 'sticker',
      mediaUrl
    )
    return { externalId: result?.message_id, raw: result }
  },
}
