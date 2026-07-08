import { db } from '@/lib/db'
import { integrations, integrationSecrets, organizationMembers, organizationRoles, notifications } from '@/lib/schema'
import { eq, and, isNull, desc, gt, sql } from 'drizzle-orm'

/**
 * GET/POST /api/integrations/instagram/check-tokens
 * Alerta admins/owners quando o token do Instagram está a ≤7 dias de expirar
 * (tokens de sistema da Meta expiram a cada 60 dias). É só um alerta — não
 * renova o token automaticamente, já que isso normalmente exige um login
 * humano recente. Sem autenticação (uso interno), chamado pelo Cron do Vercel.
 */
const TOKEN_LIFETIME_DAYS = 60
const ALERT_THRESHOLD_DAYS = 7
const DEDUPE_WINDOW_HOURS = 20
const NOTIFICATION_KIND = 'instagram_token_expiry'

async function checkTokens() {
  try {
    const rows = await db
      .select({
        integrationId: integrations.id,
        organizationId: integrations.organizationId,
        secret: integrationSecrets.secret,
      })
      .from(integrations)
      .innerJoin(integrationSecrets, eq(integrationSecrets.integrationId, integrations.id))
      .where(and(eq(integrations.type, 'instagram_direct'), eq(integrations.status, 'active'), isNull(integrations.deletedAt)))

    let alertsSent = 0

    for (const row of rows) {
      const secret = row.secret as { token_obtained_at?: string } | undefined
      if (!secret?.token_obtained_at) continue

      const obtainedAt = new Date(secret.token_obtained_at)
      const daysElapsed = (Date.now() - obtainedAt.getTime()) / (1000 * 60 * 60 * 24)
      const daysRemaining = Math.round(TOKEN_LIFETIME_DAYS - daysElapsed)
      if (daysRemaining > ALERT_THRESHOLD_DAYS) continue

      // Dedupe: não repetir alerta para esta integração se já mandamos um nas últimas horas.
      const dedupeSince = new Date(Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000)
      const [recent] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(
          eq(notifications.organizationId, row.organizationId),
          gt(notifications.createdAt, dedupeSince),
          sql`${notifications.metadata}->>'kind' = ${NOTIFICATION_KIND}`,
          sql`${notifications.metadata}->>'integrationId' = ${row.integrationId}`
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(1)
      if (recent) continue

      // Destinatários: membros com permissão manage_integrations (admins/owners).
      const members = await db
        .select({ memberId: organizationMembers.id, permissions: organizationRoles.permissions })
        .from(organizationMembers)
        .innerJoin(organizationRoles, eq(organizationRoles.id, organizationMembers.roleId))
        .where(and(eq(organizationMembers.organizationId, row.organizationId), eq(organizationMembers.status, 'active')))

      const recipients = members.filter((m) => {
        const perms = (m.permissions || {}) as Record<string, any>
        return !!(perms.manage_integrations || perms['*'] || perms.all)
      })

      const daysLabel = daysRemaining <= 0 ? 'já expirou' : `expira em ${daysRemaining} dia(s)`
      for (const recipient of recipients) {
        await db.insert(notifications).values({
          organizationId: row.organizationId,
          recipientMemberId: recipient.memberId,
          type: 'warning',
          title: 'Token do Instagram prestes a expirar',
          body: `O token de acesso da integração Instagram Direct ${daysLabel}. Gere um novo System User Token no Meta Business Suite e atualize em Configurações > Integrações > Instagram Direct.`,
          metadata: { kind: NOTIFICATION_KIND, integrationId: row.integrationId, linkUrl: '/settings/integrations/instagram' },
        })
        alertsSent++
      }
    }

    return Response.json({ status: 'ok', integrationsChecked: rows.length, alertsSent })
  } catch (err: any) {
    return Response.json({ status: 'error', message: err.message || 'Erro interno.' }, { status: 500 })
  }
}

export const GET = checkTokens
export const POST = checkTokens
