/**
 * Integração da API Oficial (whatsapp_cloud_official) de uma organização:
 * gravar (pelo formulário manual ou pelo Embedded Signup) e ler de volta com o
 * token. O token fica em integration_secrets, nunca volta pro navegador.
 */
import { db } from '@/lib/db'
import { integrations, integrationSecrets } from '@/lib/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { GRAPH_VERSION } from '@/lib/meta'

export interface ConfigCloud {
  waba_id: string
  phone_number_id: string
  business_id?: string | null
  graph_api_version?: string
  /** 'embedded_signup' quando veio do botão Conectar WhatsApp; 'manual' do formulário. */
  origem?: 'embedded_signup' | 'manual'
  /** Número que continua no aplicativo WhatsApp Business (ver lib/coexistencia). */
  coexistencia?: boolean
}

export async function salvarIntegracaoCloud(organizationId: string, config: ConfigCloud, token: string): Promise<string> {
  const cfg = { ...config, graph_api_version: config.graph_api_version || GRAPH_VERSION }

  const [existente] = await db.select({ id: integrations.id }).from(integrations)
    .where(and(eq(integrations.organizationId, organizationId), eq(integrations.type, 'whatsapp_cloud_official')))
    .limit(1)

  let id: string
  if (existente) {
    id = existente.id
    // deletedAt volta a null: reconectar uma integração removida reativa ela.
    await db.update(integrations).set({ config: cfg, status: 'active', deletedAt: null, updatedAt: new Date() })
      .where(eq(integrations.id, id))
  } else {
    const [nova] = await db.insert(integrations).values({
      organizationId,
      name: 'WhatsApp Cloud (Oficial)',
      type: 'whatsapp_cloud_official',
      status: 'active',
      config: cfg,
    }).returning({ id: integrations.id })
    id = nova.id
  }

  const [segredo] = await db.select({ id: integrationSecrets.id }).from(integrationSecrets)
    .where(eq(integrationSecrets.integrationId, id)).limit(1)
  if (segredo) {
    await db.update(integrationSecrets).set({ secret: { system_token: token }, updatedAt: new Date() })
      .where(eq(integrationSecrets.integrationId, id))
  } else {
    await db.insert(integrationSecrets).values({ integrationId: id, organizationId, secret: { system_token: token } })
  }
  return id
}

export async function lerIntegracaoCloud(organizationId: string) {
  const [integ] = await db.select({ id: integrations.id, config: integrations.config }).from(integrations)
    .where(and(eq(integrations.organizationId, organizationId), eq(integrations.type, 'whatsapp_cloud_official'), isNull(integrations.deletedAt)))
    .limit(1)
  if (!integ) return null
  const [segredo] = await db.select({ secret: integrationSecrets.secret }).from(integrationSecrets)
    .where(eq(integrationSecrets.integrationId, integ.id)).limit(1)
  return {
    id: integ.id,
    config: (integ.config || {}) as ConfigCloud,
    token: (segredo?.secret as { system_token?: string } | undefined)?.system_token || null,
  }
}

/** Igual a lerIntegracaoCloud, mas falha com 400 se faltar WABA ou token. */
export async function exigirIntegracaoCloud(organizationId: string) {
  const integ = await lerIntegracaoCloud(organizationId)
  if (!integ?.config.waba_id || !integ.token) {
    throw { status: 400, message: 'API Oficial não conectada. Use o botão Conectar WhatsApp.' }
  }
  return { ...integ, token: integ.token, wabaId: integ.config.waba_id }
}
