import { NextRequest } from 'next/server'
import { authenticateRequest, apiError, validateRequired } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { integrations, integrationSecrets, organizationRoles } from '@/lib/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'

async function assertManageIntegrations(auth: Awaited<ReturnType<typeof authenticateRequest>>) {
  if (auth.isSuperAdmin || !auth.memberId || !auth.roleId) return
  const [role] = await db.select({ permissions: organizationRoles.permissions })
    .from(organizationRoles).where(eq(organizationRoles.id, auth.roleId)).limit(1)
  if (!role) throw { status: 403, message: 'Não foi possível validar permissões.' }
  const perms = (role.permissions || {}) as Record<string, any>
  if (!perms.manage_integrations && !perms['*'] && !perms.all) {
    throw { status: 403, message: 'Permissão negada: requer manage_integrations.' }
  }
}

/**
 * POST /api/integrations/instagram
 * Conecta uma conta do Instagram — cria uma integração nova por padrão. Se já
 * existir uma integração com o mesmo instagram_business_account_id (ex: usuário
 * reenviando pra trocar o token expirado), atualiza essa em vez de duplicar.
 * Uma organização pode ter várias contas conectadas (uma linha por conta).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await assertManageIntegrations(auth)
    const body = await req.json().catch(() => ({}))
    const missing = validateRequired(body ?? {}, ['name', 'instagram_business_account_id', 'connected_page_id', 'system_token'])
    if (missing) return apiError(400, missing)

    const { name, instagram_business_account_id, connected_page_id, system_token, graph_api_version } = body
    const config = { instagram_business_account_id, connected_page_id, graph_api_version: graph_api_version ?? 'v21.0' }

    const [existing] = await db.select({ id: integrations.id }).from(integrations)
      .where(and(
        eq(integrations.organizationId, auth.organizationId),
        eq(integrations.type, 'instagram_direct'),
        isNull(integrations.deletedAt),
        sql`${integrations.config}->>'instagram_business_account_id' = ${instagram_business_account_id}`
      ))
      .limit(1)

    let integrationId: string
    if (existing) {
      integrationId = existing.id
      await db.update(integrations).set({ name, config, status: 'active', updatedAt: new Date() })
        .where(and(eq(integrations.id, integrationId), eq(integrations.organizationId, auth.organizationId)))
    } else {
      const [created] = await db.insert(integrations).values({
        organizationId: auth.organizationId,
        name,
        type: 'instagram_direct',
        status: 'active',
        config,
      }).returning({ id: integrations.id })
      integrationId = created.id
    }

    // Upsert integration secret — token_obtained_at alimenta o alerta de expiração (60 dias).
    const [existingSecret] = await db.select({ id: integrationSecrets.id }).from(integrationSecrets)
      .where(eq(integrationSecrets.integrationId, integrationId)).limit(1)

    const secret = { system_token, token_obtained_at: new Date().toISOString() }

    if (existingSecret) {
      await db.update(integrationSecrets).set({ secret, updatedAt: new Date() })
        .where(eq(integrationSecrets.integrationId, integrationId))
    } else {
      await db.insert(integrationSecrets).values({
        integrationId,
        organizationId: auth.organizationId,
        secret,
      })
    }

    return Response.json({ integration_id: integrationId })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

/**
 * GET /api/integrations/instagram
 * Lista todas as contas do Instagram conectadas nesta organização.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    const rows = await db
      .select({
        id: integrations.id,
        name: integrations.name,
        status: integrations.status,
        config: integrations.config,
        secret: integrationSecrets.secret,
      })
      .from(integrations)
      .leftJoin(integrationSecrets, eq(integrationSecrets.integrationId, integrations.id))
      .where(and(
        eq(integrations.organizationId, auth.organizationId),
        eq(integrations.type, 'instagram_direct'),
        isNull(integrations.deletedAt)
      ))

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      config: r.config,
      token_obtained_at: (r.secret as { token_obtained_at?: string } | null)?.token_obtained_at ?? null,
      has_token: !!(r.secret as { system_token?: string } | null)?.system_token,
    }))

    return Response.json({ data })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
