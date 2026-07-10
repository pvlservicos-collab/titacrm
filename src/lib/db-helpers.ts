/**
 * Helpers de query para Neon/Drizzle
 * Substitui padrões recorrentes do Supabase client
 *
 * Substitui:
 *   supabase.from('leads').select('*').eq('organization_id', orgId)
 *   → db.select().from(leads).where(eq(leads.organizationId, orgId))
 */
import { eq, and, isNull, desc, asc, sql } from 'drizzle-orm'
import { db } from './db'
import {
  leads, leadActivities, leadTags, tags, organizationMembers,
  profiles, pipelineStages, pipelines, integrations, organizationRoles,
  customFieldDefinitions, customFieldCategories, notifications,
} from './schema'

// ── Concorrência ──────────────────────────────────────────────────────────────

/**
 * Código de erro padrão do Postgres pra violação de constraint única (23505). Usado
 * junto com as constraints em leads(organization_id, phone)/leads(integration_id,
 * external_id)/lead_activities(metadata->>'*_message_id') — quando duas requisições
 * concorrentes (ex: dois webhooks quase simultâneos) tentam criar o mesmo lead ou a
 * mesma mensagem, o banco garante que só uma vence a corrida; a outra pega esse erro
 * em vez de duplicar silenciosamente.
 */
export function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === '23505'
}

// ── Pedidos ───────────────────────────────────────────────────────────────────

export interface OrderAddressSync {
  cep?: string | null
  address?: string | null
  addressNumber?: string | null
  addressComplement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
}

/**
 * Espelha o último status/forma de pagamento do pedido no lead, usado pela
 * etiqueta "Pago/Pendente" da lista de conversas do Chat (LeadListItem).
 * Precisa ser chamado tanto na criação quanto em qualquer atualização do
 * payment_status de um pedido, senão a etiqueta da lista fica desatualizada.
 *
 * Quando `address` é passado, também grava o endereço nas colunas do lead
 * (cep/address/address_number/...) — assim o endereço do último pedido já
 * vem pronto pra pré-preencher a próxima compra do mesmo cliente.
 */
export async function syncLeadLastOrderAttributes(
  organizationId: string,
  leadId: string,
  paymentStatus: string,
  paymentMethod: string,
  address?: OrderAddressSync
) {
  if (address) {
    await db.execute(sql`
      UPDATE leads
      SET custom_attributes = jsonb_set(
        jsonb_set(
          COALESCE(custom_attributes, '{}'),
          '{last_order_payment_status}', ${JSON.stringify(paymentStatus)}::jsonb
        ),
        '{last_order_payment_method}', ${JSON.stringify(paymentMethod)}::jsonb
      ),
      cep = ${address.cep ?? null},
      address = ${address.address ?? null},
      address_number = ${address.addressNumber ?? null},
      address_complement = ${address.addressComplement ?? null},
      neighborhood = ${address.neighborhood ?? null},
      city = ${address.city ?? null},
      state = ${address.state ?? null},
      updated_at = NOW()
      WHERE id = ${leadId} AND organization_id = ${organizationId}
    `)
    return
  }

  await db.execute(sql`
    UPDATE leads
    SET custom_attributes = jsonb_set(
      jsonb_set(
        COALESCE(custom_attributes, '{}'),
        '{last_order_payment_status}', ${JSON.stringify(paymentStatus)}::jsonb
      ),
      '{last_order_payment_method}', ${JSON.stringify(paymentMethod)}::jsonb
    ),
    updated_at = NOW()
    WHERE id = ${leadId} AND organization_id = ${organizationId}
  `)
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export async function getLeadsWithOwner(organizationId: string, stageId?: string) {
  let query = db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, organizationId),
        isNull(leads.deletedAt),
        stageId ? eq(leads.stageId, stageId) : undefined
      )
    )
    .orderBy(desc(leads.createdAt))

  return query
}

export async function getLeadById(organizationId: string, leadId: string) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.id, leadId),
        eq(leads.organizationId, organizationId),
        isNull(leads.deletedAt)
      )
    )
    .limit(1)
  return lead || null
}

// ── Lead Activities ───────────────────────────────────────────────────────────

export async function getLeadActivities(organizationId: string, leadId: string) {
  return db
    .select({
      id: leadActivities.id,
      type: leadActivities.type,
      content: leadActivities.content,
      metadata: leadActivities.metadata,
      actorMemberId: leadActivities.actorMemberId,
      createdAt: leadActivities.createdAt,
      actor: {
        id: organizationMembers.id,
        fullName: profiles.fullName,
        avatarUrl: profiles.avatarUrl,
      },
    })
    .from(leadActivities)
    .leftJoin(organizationMembers, eq(organizationMembers.id, leadActivities.actorMemberId))
    .leftJoin(profiles, eq(profiles.id, organizationMembers.userId))
    .where(
      and(
        eq(leadActivities.organizationId, organizationId),
        eq(leadActivities.leadId, leadId)
      )
    )
    .orderBy(asc(leadActivities.createdAt))
}

// ── Organization Members ──────────────────────────────────────────────────────

export async function getMemberByUserId(organizationId: string, userId: string) {
  const [member] = await db
    .select({
      id: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      roleId: organizationMembers.roleId,
      status: organizationMembers.status,
      fullName: profiles.fullName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(organizationMembers)
    .leftJoin(profiles, eq(profiles.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, 'active')
      )
    )
    .limit(1)

  return member || null
}

// ── Pipelines ─────────────────────────────────────────────────────────────────

export async function getPipelinesWithStages(organizationId: string) {
  const pipelinesData = await db
    .select()
    .from(pipelines)
    .where(
      and(
        eq(pipelines.organizationId, organizationId),
        isNull(pipelines.deletedAt)
      )
    )
    .orderBy(asc(pipelines.createdAt))

  const stagesData = await db
    .select()
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.organizationId, organizationId),
        isNull(pipelineStages.deletedAt)
      )
    )
    .orderBy(asc(pipelineStages.rank))

  return pipelinesData.map((p) => ({
    ...p,
    stages: stagesData.filter((s) => s.pipelineId === p.id),
  }))
}
