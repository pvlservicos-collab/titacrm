export interface ChannelSendResult {
  externalId?: string
  raw?: any
}

export interface ChannelAdapter {
  /** Chave de metadata onde o id externo da mensagem enviada é gravado (ex: 'whatsapp_message_id'). */
  metadataIdKey: string
  supportsGroups: boolean
  /**
   * integrationId identifica a integração específica do lead (não apenas
   * organizationId+type) — necessário para canais com múltiplas contas por
   * organização (ex: Instagram). Adapters que hoje são singleton por org
   * (WhatsApp Cloud, Evolution) simplesmente ignoram o parâmetro.
   */
  sendText(organizationId: string, integrationId: string | null, recipient: string, content: string, isGroup?: boolean): Promise<ChannelSendResult>
  sendMedia(
    organizationId: string,
    integrationId: string | null,
    recipient: string,
    mediaType: string,
    mediaUrl: string,
    caption?: string,
    filename?: string,
    isGroup?: boolean
  ): Promise<ChannelSendResult>
}
