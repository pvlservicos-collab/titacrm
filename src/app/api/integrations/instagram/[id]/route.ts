import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { integrations, organizationRoles } from '@/lib/schema'
import { eq, and } from 'drizzle-orm'

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
 * DELETE /api/integrations/instagram/[id]
 * Desconecta uma conta do Instagram (soft delete — leads/mensagens já
 * recebidos por essa conta continuam no histórico).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    await assertManageIntegrations(auth)
    const { id } = await params

    await db.update(integrations)
      .set({ status: 'disabled', deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(integrations.id, id),
        eq(integrations.organizationId, auth.organizationId),
        eq(integrations.type, 'instagram_direct')
      ))

    return Response.json({ status: 'ok' })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
