import { requireSuperadmin, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { organizations, organizationMembers, organizationRoles, profiles, users, leadActivities, integrations, integrationSecrets } from '@/lib/schema'
import { eq, sql, isNull } from 'drizzle-orm'

// GET /api/admin/organizations — visão geral de todas as organizações (linha =
// organização) pro painel /admin. Uma query por organização seria N+1 pesado com
// muitos tenants, mas pro volume esperado agora (dezenas, não milhares) é simples
// e correto — otimizar (joins agregados) só quando isso virar gargalo de verdade.
export async function GET() {
  try {
    await requireSuperadmin()

    const orgs = await db.select({
      id: organizations.id,
      name: organizations.name,
      subscriptionStatus: organizations.subscriptionStatus,
      createdAt: organizations.createdAt,
    }).from(organizations).where(isNull(organizations.deletedAt)).orderBy(organizations.createdAt)

    const result = await Promise.all(orgs.map(async (org) => {
      const members = await db.select({
        memberId: organizationMembers.id,
        userId: organizationMembers.userId,
        roleId: organizationMembers.roleId,
        fullName: profiles.fullName,
        email: users.email,
        roleName: organizationRoles.name,
      })
        .from(organizationMembers)
        .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .innerJoin(organizationRoles, eq(organizationRoles.id, organizationMembers.roleId))
        .where(eq(organizationMembers.organizationId, org.id))

      const [{ count: totalMessages }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(leadActivities).where(eq(leadActivities.organizationId, org.id))

      const [whatsapp] = await db.select({ id: integrations.id, config: integrations.config })
        .from(integrations)
        .where(sql`${integrations.organizationId} = ${org.id} AND ${integrations.type} = 'whatsapp_cloud_official' AND ${integrations.deletedAt} IS NULL`)
        .limit(1)

      let systemTokenSet = false
      if (whatsapp) {
        const [secret] = await db.select({ secret: integrationSecrets.secret })
          .from(integrationSecrets).where(eq(integrationSecrets.integrationId, whatsapp.id)).limit(1)
        systemTokenSet = !!(secret?.secret as any)?.system_token
      }

      // Dono = quem tem papel de acesso total (Admin/Founder — reconhece o wildcard,
      // não só o nome do papel, já que dá pra criar um papel só-leitura chamado "Admin").
      const roleRows = await db.select({ id: organizationRoles.id, permissions: organizationRoles.permissions })
        .from(organizationRoles).where(eq(organizationRoles.organizationId, org.id))
      const ownerRoleIds = new Set(roleRows.filter((r) => (r.permissions as any)?.['*']).map((r) => r.id))

      return {
        ...org,
        totalMessages,
        whatsapp: whatsapp ? {
          integrationId: whatsapp.id,
          wabaId: (whatsapp.config as any)?.waba_id || '',
          phoneNumberId: (whatsapp.config as any)?.phone_number_id || '',
          graphApiVersion: (whatsapp.config as any)?.graph_api_version || 'v21.0',
          hasSystemToken: systemTokenSet,
        } : null,
        owner: members.find((m) => ownerRoleIds.has((m as any).roleId)) || members[0] || null,
        members,
      }
    }))

    return Response.json(result)
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
