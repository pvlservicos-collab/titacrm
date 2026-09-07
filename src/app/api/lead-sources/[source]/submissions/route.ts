/**
 * GET /api/lead-sources/{source}/submissions — as linhas da planilha de uma aba.
 *
 * Paginado por limit/offset (é um log: cresce sem teto e a tela carrega mais ao
 * rolar). `q` filtra por nome / telefone / e-mail / instagram / id externo.
 */
import { NextRequest } from 'next/server'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { leadSourceSubmissions } from '@/lib/schema'
import { getLeadSource, LEAD_SOURCE_ORDER } from '@/lib/leadSources'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ source: string }> }
) {
  try {
    const auth = await authenticateRequest(req)
    const { source } = await params

    const sourceDef = getLeadSource(source)
    if (!sourceDef) {
      return apiError(404, `Fonte desconhecida: "${source}". Válidas: ${LEAD_SOURCE_ORDER.join(', ')}.`)
    }

    const url = req.nextUrl
    const limit = Math.min(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT)
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
    const q = url.searchParams.get('q')?.trim()

    const filters = [
      eq(leadSourceSubmissions.organizationId, auth.organizationId),
      eq(leadSourceSubmissions.source, sourceDef.key),
    ]
    if (q) {
      const like = `%${q}%`
      const match = or(
        ilike(leadSourceSubmissions.name, like),
        ilike(leadSourceSubmissions.email, like),
        ilike(leadSourceSubmissions.phone, like),
        ilike(leadSourceSubmissions.instagram, like),
        ilike(leadSourceSubmissions.externalId, like)
      )
      if (match) filters.push(match)
    }
    const where = and(...filters)

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: leadSourceSubmissions.id,
          external_id: leadSourceSubmissions.externalId,
          name: leadSourceSubmissions.name,
          email: leadSourceSubmissions.email,
          phone: leadSourceSubmissions.phone,
          instagram: leadSourceSubmissions.instagram,
          payload: leadSourceSubmissions.payload,
          lead_id: leadSourceSubmissions.leadId,
          received_at: leadSourceSubmissions.receivedAt,
          updated_at: leadSourceSubmissions.updatedAt,
        })
        .from(leadSourceSubmissions)
        .where(where)
        .orderBy(desc(leadSourceSubmissions.receivedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(leadSourceSubmissions)
        .where(where),
    ])

    return Response.json({ data: rows, total, limit, offset })
  } catch (err: any) {
    return apiError(err?.status || 500, err?.message || 'Erro interno.')
  }
}
