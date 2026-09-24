/**
 * Conta de acesso do revisor da Meta (análise do app).
 *
 * Tem usuário e senha próprios (CRM_REVISOR_USER / CRM_REVISOR_PASS), que
 * valem na senha da porta e na tela de login, e entra num usuário próprio do
 * CRM (CRM_REVISOR_EMAIL) — nunca no do dono. Como o número conectado é o real
 * da empresa, os envios dessa conta têm cota: CRM_REVISOR_LIMITE (padrão 10),
 * contando texto, mídia e template. Sem as variáveis, nada disso existe.
 */
import { db } from '@/lib/db'
import { users, leadActivities } from '@/lib/schema'
import { and, eq, sql } from 'drizzle-orm'

export const LIMITE_REVISOR = Number(process.env.CRM_REVISOR_LIMITE) || 10

export function credenciaisRevisor() {
  const usuario = process.env.CRM_REVISOR_USER?.toLowerCase()
  const senha = process.env.CRM_REVISOR_PASS
  const email = process.env.CRM_REVISOR_EMAIL?.toLowerCase()
  return usuario && senha && email ? { usuario, senha, email } : null
}

/** Lança 429 se a conta de revisão já usou a cota de envios. Outras contas passam direto. */
export async function exigirCotaDeEnvio(auth: { userId: string | null; memberId: string | null }) {
  const revisor = credenciaisRevisor()
  if (!revisor || !auth.userId || !auth.memberId) return
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, auth.userId)).limit(1)
  if (u?.email?.toLowerCase() !== revisor.email) return

  const [{ enviadas }] = await db
    .select({ enviadas: sql<number>`count(*)::int` })
    .from(leadActivities)
    .where(and(
      eq(leadActivities.actorMemberId, auth.memberId),
      eq(leadActivities.type, 'whatsapp'),
      sql`${leadActivities.metadata}->>'direction' = 'outbound'`,
    ))
  if (enviadas >= LIMITE_REVISOR) {
    throw { status: 429, message: `A conta de revisão pode enviar no máximo ${LIMITE_REVISOR} mensagens, e esse limite foi atingido.` }
  }
}
