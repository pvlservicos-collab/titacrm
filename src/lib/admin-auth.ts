import { db } from '@/lib/db'
import { organizationRoles } from '@/lib/schema'
import { eq } from 'drizzle-orm'

// 'admin' e o nome do cargo que o seed cria (scripts/seed-workspace.mjs).
const ADMIN_ROLE_NAMES = new Set(['administrador', 'admin', 'owner', 'master'])

export async function getOrgRole(roleId: string | null) {
  if (!roleId) return null
  const [role] = await db
    .select({ name: organizationRoles.name, permissions: organizationRoles.permissions })
    .from(organizationRoles)
    .where(eq(organizationRoles.id, roleId))
    .limit(1)
  return role ?? null
}

/** Cargos "administrador"/"owner"/"master" sempre podem ações restritas; superadmin sempre pode. */
export async function isOrgAdmin(auth: { isSuperAdmin?: boolean; roleId: string | null }): Promise<boolean> {
  if (auth.isSuperAdmin) return true
  const role = await getOrgRole(auth.roleId)
  if (!role?.name) return false
  return ADMIN_ROLE_NAMES.has(role.name.toLowerCase())
}

/**
 * Gerenciar integracoes (conectar WhatsApp, registrar numero...): superadmin,
 * cargo de admin ou permissao manage_integrations. Lanca { status: 403 }.
 */
export async function exigirGestaoDeIntegracoes(auth: { isSuperAdmin?: boolean; memberId: string | null; roleId: string | null }) {
  if (auth.isSuperAdmin) return
  if (!auth.memberId || !auth.roleId) return // token de API da organizacao
  const role = await getOrgRole(auth.roleId)
  if (!role) throw { status: 403, message: 'Não foi possível validar permissões.' }
  if (ADMIN_ROLE_NAMES.has((role.name || '').toLowerCase())) return
  const perms = (role.permissions || {}) as Record<string, any>
  if (!perms.manage_integrations && !perms['*'] && !perms.all) {
    throw { status: 403, message: 'Permissão negada: requer manage_integrations.' }
  }
}
