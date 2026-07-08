import type { ChannelAdapter } from './types'
import { whatsappCloudAdapter } from './whatsappCloud'
import { evolutionAdapter } from './evolution'
import { instagramAdapter } from './instagram'

/**
 * Qualquer tipo de integração não mapeado explicitamente (whatsapp_cloud_official,
 * whatsapp_lite, desconhecido, ausente) cai no adapter da Cloud API — mesmo
 * fallback que já existia no if/else original, preservado para não mudar
 * comportamento de leads com integração não mapeada.
 */
export function getChannelAdapter(integrationType: string | null | undefined): ChannelAdapter {
  if (integrationType === 'whatsapp_evolution') return evolutionAdapter
  if (integrationType === 'instagram_direct') return instagramAdapter
  return whatsappCloudAdapter
}
