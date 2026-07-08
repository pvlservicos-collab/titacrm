import { NextRequest } from 'next/server'
import { authenticateRequest, apiError, validateRequired, validateSource } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { publishEvent, channels, events } from '@/lib/realtime'
import {
  leads, leadTags, tags, organizationMembers, profiles, pipelineStages, integrations,
} from '@/lib/schema'
import { eq, and, isNull, desc, asc, ilike, or, sql, count } from 'drizzle-orm'
import { mapLead } from '@/lib/mappers'
import type { Integration } from '@/lib/types'

/**
 * GET /api/leads
 * Lista leads com paginação, filtros e busca
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    const { searchParams } = new URL(req.url)

    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const q = searchParams.get('q')
    const phone = searchParams.get('phone')
    const assignedTo = searchParams.get('assigned_to')
    const returnAll = searchParams.get('returnAll') === 'true'
    const stageId = searchParams.get('stage_id')
    const excludeGroups = searchParams.get('exclude_groups') === 'true'
    const owner = searchParams.get('owner')

    const conditions = [
      eq(leads.organizationId, auth.organizationId),
      isNull(leads.deletedAt),
    ]

    if (q) conditions.push(or(ilike(leads.title, `%${q}%`), ilike(leads.email, `%${q}%`), ilike(leads.phone, `%${q}%`))!)
    if (phone) conditions.push(ilike(leads.phone, `%${phone}%`))
    if (assignedTo) conditions.push(eq(leads.ownerMemberId, assignedTo))
    if (owner) conditions.push(eq(leads.ownerMemberId, owner))
    if (stageId) conditions.push(eq(leads.stageId, stageId))
    if (excludeGroups) conditions.push(or(isNull(leads.isGroup), eq(leads.isGroup, false))!)

    const offset = (page - 1) * limit

    const query = db
      .select({ lead: leads, integrationType: integrations.type })
      .from(leads)
      .leftJoin(integrations, eq(integrations.id, leads.integrationId))
      .where(and(...conditions))
      .orderBy(desc(sql`coalesce(${leads.lastActivityAt}, ${leads.createdAt})`))

    const rows = returnAll ? await query : await query.limit(limit).offset(offset)
    const data = rows.map((r) => r.lead)

    // Buscar tags para cada lead
    const leadIds = data.map((l) => l.id)
    let tagsMap: Record<string, any[]> = {}
    if (leadIds.length > 0) {
      const tagsData = await db
        .select({
          leadId: leadTags.leadId,
          tagId: leadTags.tagId,
          name: tags.name,
          color: tags.color,
        })
        .from(leadTags)
        .leftJoin(tags, eq(tags.id, leadTags.tagId))
        .where(sql`${leadTags.leadId} = ANY(${sql.raw(`ARRAY['${leadIds.join("','")}']::uuid[]`)})`)

      for (const t of tagsData) {
        if (!tagsMap[t.leadId]) tagsMap[t.leadId] = []
        tagsMap[t.leadId].push({ tag_id: t.tagId, tag: { id: t.tagId, name: t.name, color: t.color } })
      }
    }

    const result = rows.map((r) => ({
      ...mapLead(r.lead),
      lead_tags: tagsMap[r.lead.id] || [],
      integration: r.integrationType ? ({ type: r.integrationType } as Integration) : undefined,
    }))

    return Response.json({ data: result, page, limit })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

/**
 * POST /api/leads
 * Cria um novo lead
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    const body = await req.json()

    const requiredError = validateRequired(body, ['title', 'source'])
    if (requiredError) return apiError(400, requiredError)

    // Verifica duplicata por telefone
    if (body.phone) {
      const [existing] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.organizationId, auth.organizationId),
            eq(leads.phone, body.phone),
            isNull(leads.deletedAt)
          )
        )
        .limit(1)

      if (existing) return Response.json({ data: existing, existed: true })
    }

    const [firstStage] = await db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.organizationId, auth.organizationId),
          isNull(pipelineStages.deletedAt)
        )
      )
      .orderBy(asc(pipelineStages.rank))
      .limit(1)

    const [lead] = await db
      .insert(leads)
      .values({
        organizationId: auth.organizationId,
        title: body.title,
        phone: body.phone || null,
        email: body.email || null,
        stageId: body.stage_id || firstStage?.id || null,
        ownerMemberId: body.owner_member_id || null,
        customAttributes: body.custom_fields || {},
        lastActivityAt: new Date(),
      })
      .returning()

    // Aplicar tags se enviadas
    if (body.tags && Array.isArray(body.tags) && body.tags.length > 0) {
      await db.insert(leadTags).values(
        body.tags.map((tagId: string) => ({
          leadId: lead.id,
          tagId,
          organizationId: auth.organizationId,
        }))
      ).onConflictDoNothing()
    }

    await publishEvent(channels.orgLeads(auth.organizationId), events.LEAD_CREATED, { id: lead.id })

    return Response.json({ data: lead }, { status: 201 })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
