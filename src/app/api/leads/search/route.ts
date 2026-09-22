import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { leads, leadActivities, leadSourceSubmissions } from '@/lib/schema'
import { eq, and, isNull, ilike, or, desc, inArray, sql } from 'drizzle-orm'
import type { LeadWithOwner, SearchHit } from '@/lib/types'
import { mapLead } from '@/lib/mappers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const q = (body.q ?? '').trim()
    const limit = Math.min(Math.max(body.limit ?? 50, 1), 100)

    if (q.length < 2) {
      return NextResponse.json({ error: 'q must be at least 2 characters' }, { status: 400 })
    }

    const auth = await authenticateRequest(req)
    const searchTerm = `%${q}%`

    /*
     * Pelo @ do Instagram também. Quem atende costuma ter só o @ na mão (veio
     * da DM, do print, da planilha), e o @ nem sempre está no lead: o da Agenda
     * fica no cadastro dela (lead_source_submissions), o do Direct fica em
     * custom_attributes. O "@" digitado é ignorado — ninguém guarda com ele.
     */
    const arroba = q.replace(/^@+/, '')
    const porInstagram = arroba.length >= 2 ? `%${arroba}%` : null
    const idsPeloCadastro = porInstagram
      ? (await db.selectDistinct({ id: leadSourceSubmissions.leadId })
          .from(leadSourceSubmissions)
          .where(and(
            eq(leadSourceSubmissions.organizationId, auth.organizationId),
            ilike(leadSourceSubmissions.instagram, porInstagram)
          ))
          .limit(limit)
        ).map((r) => r.id).filter((id): id is string => !!id)
      : []

    const leadResults = await db.select().from(leads)
      .where(and(
        eq(leads.organizationId, auth.organizationId),
        isNull(leads.deletedAt),
        or(
          ilike(leads.title, searchTerm),
          ilike(leads.phone, searchTerm),
          ilike(leads.email, searchTerm),
          ...(porInstagram ? [
            sql`${leads.customAttributes}->>'instagram_username' ILIKE ${porInstagram}`,
            sql`${leads.customAttributes}->>'instagram' ILIKE ${porInstagram}`,
          ] : []),
          ...(idsPeloCadastro.length > 0 ? [inArray(leads.id, idsPeloCadastro)] : []),
        )
      ))
      .limit(limit)

    const activityResults = await db.select({ leadId: leadActivities.leadId, content: leadActivities.content, createdAt: leadActivities.createdAt })
      .from(leadActivities)
      .where(and(eq(leadActivities.organizationId, auth.organizationId), ilike(leadActivities.content, searchTerm)))
      .orderBy(desc(leadActivities.createdAt))
      .limit(limit)

    const leadMap = new Map(leadResults.map(l => [l.id, l]))

    const hits: SearchHit[] = [
      ...leadResults.map(lead => ({
        lead: mapLead(lead) as unknown as LeadWithOwner,
        matchType: 'title' as const,
        snippet: undefined,
        matchedAt: lead.lastActivityAt?.toString(),
      })),
    ]

    const seenLeadIds = new Set(leadResults.map(l => l.id))
    for (const act of activityResults) {
      if (!seenLeadIds.has(act.leadId)) {
        seenLeadIds.add(act.leadId)
        const lead = leadMap.get(act.leadId)
        if (lead) {
          hits.push({
            lead: mapLead(lead) as unknown as LeadWithOwner,
            matchType: 'message' as const,
            snippet: act.content?.slice(0, 120) || undefined,
            matchedAt: act.createdAt?.toString(),
          })
        }
      }
    }

    return NextResponse.json({ hits })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
