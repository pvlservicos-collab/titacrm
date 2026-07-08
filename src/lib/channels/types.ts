export interface ChannelSendResult {
  externalId?: string
  raw?: any
}

export interface ChannelAdapter {
  /** Chave de metadata onde o id externo da mensagem enviada é gravado (ex: 'whatsapp_message_id'). */
  metadataIdKey: string
  supportsGroups: boolean
  sendText(organizationId: string, recipient: string, content: string, isGroup?: boolean): Promise<ChannelSendResult>
  sendMedia(
    organizationId: string,
    recipient: string,
    mediaType: string,
    mediaUrl: string,
    caption?: string,
    filename?: string,
    isGroup?: boolean
  ): Promise<ChannelSendResult>
}
