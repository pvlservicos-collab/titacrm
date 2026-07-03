import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { quickReplies } from '@/lib/schema'
import { eq, and, or, isNull, asc } from 'drizzle-orm'
import { canManageSharedQuickReplies } from './permissions'

/**
 * GET /api/quick-replies
 * Lista a biblioteca compartilhada da organização + os atalhos pessoais do membro autenticado.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)

    const rows = await db
      .select()
      .from(quickReplies)
      .where(
        and(
          eq(quickReplies.organizationId, auth.organizationId),
          isNull(quickReplies.deletedAt),
          or(
            eq(quickReplies.scope, 'shared'),
            and(eq(quickReplies.scope, 'personal'), eq(quickReplies.createdByMemberId, auth.memberId || ''))
          )
        )
      )
      .orderBy(asc(quickReplies.category), asc(quickReplies.shortcut))

    return Response.json({
      data: {
        shared: rows.filter((r) => r.scope === 'shared'),
        personal: rows.filter((r) => r.scope === 'personal'),
      },
    })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

function normalizeShortcut(raw: string): string {
  return raw.trim().replace(/^\/+/, '')
}

/**
 * POST /api/quick-replies
 * Cria uma resposta rápida. scope='shared' exige permissão manage_quick_replies;
 * scope='personal' é sempre gravado como dono o próprio membro autenticado.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    const body = await req.json()

    const scope = body.scope === 'shared' ? 'shared' : 'personal'
    const shortcut = normalizeShortcut(String(body.shortcut || ''))
    const content = typeof body.content === 'string' ? body.content : ''
    const mediaUrl = body.mediaUrl || null

    if (!shortcut) return apiError(400, 'Informe um atalho (ex: promo-fim-de-ano).')
    if (/\s/.test(shortcut)) return apiError(400, 'O atalho não pode conter espaços.')
    if (!content.trim() && !mediaUrl) return apiError(400, 'Informe um texto ou anexe uma mídia.')

    if (scope === 'shared') {
      const canManage = await canManageSharedQuickReplies(auth.roleId)
      if (!canManage) return apiError(403, 'Você não tem permissão para gerenciar a biblioteca compartilhada.')
    } else if (!auth.memberId) {
      return apiError(400, 'Atalhos pessoais exigem um membro autenticado.')
    }

    try {
      const [created] = await db
        .insert(quickReplies)
        .values({
          organizationId: auth.organizationId,
          scope,
          createdByMemberId: scope === 'personal' ? auth.memberId : (auth.memberId || null),
          shortcut,
          category: body.category?.trim() || null,
          content,
          mediaUrl,
          mediaType: body.mediaType || null,
          mediaMimetype: body.mediaMimetype || null,
          mediaFilename: body.mediaFilename || null,
        })
        .returning()

      return Response.json({ data: created }, { status: 201 })
    } catch (err: any) {
      if (err?.code === '23505') return apiError(409, `Já existe um atalho "/${shortcut}".`)
      throw err
    }
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
