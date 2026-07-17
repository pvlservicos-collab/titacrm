import { NextRequest } from 'next/server'
import { requireSuperadmin, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { organizations, organizationMembers, organizationRoles, profiles, users, leadActivities, integrations, integrationSecrets } from '@/lib/schema'
import { eq, and, sql } from 'drizzle-orm'

const VALID_STATUSES = ['active', 'unpaid', 'cancelled']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperadmin()
    const { id } = await params

    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1)
    if (!org) return apiError(404, 'Organização não encontrada.')

    const members = await db.select({
      memberId: organizationMembers.id,
      userId: organizationMembers.userId,
      fullName: profiles.fullName,
      email: users.email,
      roleName: organizationRoles.name,
      createdAt: organizationMembers.createdAt,
    })
      .from(organizationMembers)
      .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .innerJoin(organizationRoles, eq(organizationRoles.id, organizationMembers.roleId))
      .where(eq(organizationMembers.organizationId, id))

    const [{ count: totalMessages }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leadActivities).where(eq(leadActivities.organizationId, id))

    const [whatsapp] = await db.select({ id: integrations.id, config: integrations.config })
      .from(integrations)
      .where(sql`${integrations.organizationId} = ${id} AND ${integrations.type} = 'whatsapp_cloud_official' AND ${integrations.deletedAt} IS NULL`)
      .limit(1)

    let systemToken = ''
    if (whatsapp) {
      const [secret] = await db.select({ secret: integrationSecrets.secret })
        .from(integrationSecrets).where(eq(integrationSecrets.integrationId, whatsapp.id)).limit(1)
      systemToken = (secret?.secret as any)?.system_token || ''
    }

    return Response.json({
      ...org,
      totalMessages,
      members,
      whatsapp: whatsapp ? {
        integrationId: whatsapp.id,
        wabaId: (whatsapp.config as any)?.waba_id || '',
        phoneNumberId: (whatsapp.config as any)?.phone_number_id || '',
        graphApiVersion: (whatsapp.config as any)?.graph_api_version || 'v21.0',
        systemToken,
      } : null,
    })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperadmin()
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    if (body.subscription_status !== undefined) {
      if (!VALID_STATUSES.includes(body.subscription_status)) {
        return apiError(400, `subscription_status precisa ser um de: ${VALID_STATUSES.join(', ')}`)
      }
      await db.update(organizations).set({ subscriptionStatus: body.subscription_status, updatedAt: new Date() })
        .where(eq(organizations.id, id))
    }

    if (body.waba_id !== undefined || body.phone_number_id !== undefined || body.system_token !== undefined || body.graph_api_version !== undefined) {
      const [existing] = await db.select({ id: integrations.id, config: integrations.config }).from(integrations)
        .where(sql`${integrations.organizationId} = ${id} AND ${integrations.type} = 'whatsapp_cloud_official' AND ${integrations.deletedAt} IS NULL`)
        .limit(1)

      const config = {
        waba_id: body.waba_id ?? (existing?.config as any)?.waba_id ?? '',
        phone_number_id: body.phone_number_id ?? (existing?.config as any)?.phone_number_id ?? '',
        graph_api_version: body.graph_api_version ?? (existing?.config as any)?.graph_api_version ?? 'v21.0',
      }

      let integrationId: string
      if (existing) {
        integrationId = existing.id
        await db.update(integrations).set({ config, status: 'active', updatedAt: new Date() }).where(eq(integrations.id, integrationId))
      } else {
        const [created] = await db.insert(integrations).values({
          organizationId: id, name: 'WhatsApp Cloud (Oficial)', type: 'whatsapp_cloud_official', status: 'active', config,
        }).returning({ id: integrations.id })
        integrationId = created.id
      }

      if (body.system_token) {
        const [existingSecret] = await db.select({ id: integrationSecrets.id }).from(integrationSecrets)
          .where(eq(integrationSecrets.integrationId, integrationId)).limit(1)
        if (existingSecret) {
          await db.update(integrationSecrets).set({ secret: { system_token: body.system_token }, updatedAt: new Date() })
            .where(eq(integrationSecrets.integrationId, integrationId))
        } else {
          await db.insert(integrationSecrets).values({ integrationId, organizationId: id, secret: { system_token: body.system_token } })
        }
      }
    }

    return Response.json({ success: true })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
