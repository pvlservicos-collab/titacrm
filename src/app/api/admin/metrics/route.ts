import { requireSuperadmin, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { users, organizations, leadActivities } from '@/lib/schema'
import { sql } from 'drizzle-orm'

export async function GET() {
  try {
    await requireSuperadmin()

    const [[{ count: totalUsers }], [{ count: totalOrganizations }], [{ count: totalMessages }]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(organizations),
      db.select({ count: sql<number>`count(*)::int` }).from(leadActivities),
    ])

    return Response.json({ totalUsers, totalOrganizations, totalMessages })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
