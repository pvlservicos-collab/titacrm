import { db } from '@/lib/db'
import { organizationRoles } from '@/lib/schema'
import { eq } from 'drizzle-orm'

/**
 * Segue a mesma heurística de admin usada em RolePermissionsPanel.tsx / financeiro/layout.tsx
 * (cargos "administrador"/"owner"/"master" sempre podem; os demais dependem da permissão
 * granular settings.manage_quick_replies).
 */
export async function canManageSharedQuickReplies(roleId: string | null): Promise<boolean> {
  if (!roleId) return false

  const [role] = await db
    .select({ name: organizationRoles.name, permissions: organizationRoles.permissions })
    .from(organizationRoles)
    .where(eq(organizationRoles.id, roleId))
    .limit(1)

  if (!role) return false

  const name = role.name?.toLowerCase()
  if (name === 'administrador' || name === 'owner' || name === 'master') return true

  return !!(role.permissions as any)?.settings?.manage_quick_replies
}
