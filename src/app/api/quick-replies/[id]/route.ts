import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { quickReplies } from '@/lib/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { canManageSharedQuickReplies } from '../permissions'

type Params = { params: Promise<{ id: string }> }

async function loadOwned(id: string, organizationId: string) {
  const [existing] = await db
    .select()
    .from(quickReplies)
    .where(and(eq(quickReplies.id, id), eq(quickReplies.organizationId, organizationId), isNull(quickReplies.deletedAt)))
    .limit(1)
  return existing
}

async function assertCanMutate(existing: { scope: string; createdByMemberId: string | null }, auth: { memberId: string | null; roleId: string | null }) {
  if (existing.scope === 'shared') {
    const canManage = await canManageSharedQuickReplies(auth.roleId)
    if (!canManage) throw { status: 403, message: 'Você não tem permissão para gerenciar a biblioteca compartilhada.' }
  } else if (existing.createdByMemberId !== auth.memberId) {
    throw { status: 403, message: 'Você só pode editar seus próprios atalhos.' }
  }
}

/**
 * PATCH /api/quick-replies/[id]
 * scope é imutável após a criação — só o conteúdo, atalho, categoria e mídia podem mudar.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateRequest(req)
    const { id } = await params
    const body = await req.json()

    const existing = await loadOwned(id, auth.organizationId)
    if (!existing) return apiError(404, 'Resposta rápida não encontrada.')
    await assertCanMutate(existing, auth)

    const updates: any = { updatedAt: new Date() }
    if (body.shortcut !== undefined) {
      const shortcut = String(body.shortcut).trim().replace(/^\/+/, '')
      if (!shortcut) return apiError(400, 'Informe um atalho.')
      if (/\s/.test(shortcut)) return apiError(400, 'O atalho não pode conter espaços.')
      updates.shortcut = shortcut
    }
    if (body.category !== undefined) updates.category = body.category?.trim() || null
    if (body.content !== undefined) updates.content = body.content
    if (body.mediaUrl !== undefined) updates.mediaUrl = body.mediaUrl || null
    if (body.mediaType !== undefined) updates.mediaType = body.mediaType || null
    if (body.mediaMimetype !== undefined) updates.mediaMimetype = body.mediaMimetype || null
    if (body.mediaFilename !== undefined) updates.mediaFilename = body.mediaFilename || null

    if ((updates.content !== undefined || updates.mediaUrl !== undefined)) {
      const nextContent = updates.content !== undefined ? updates.content : existing.content
      const nextMediaUrl = updates.mediaUrl !== undefined ? updates.mediaUrl : existing.mediaUrl
      if (!String(nextContent || '').trim() && !nextMediaUrl) {
        return apiError(400, 'Informe um texto ou anexe uma mídia.')
      }
    }

    try {
      const [updated] = await db
        .update(quickReplies)
        .set(updates)
        .where(eq(quickReplies.id, id))
        .returning()
      return Response.json({ data: updated })
    } catch (err: any) {
      if (err?.code === '23505') return apiError(409, `Já existe um atalho "/${updates.shortcut}".`)
      throw err
    }
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

/**
 * DELETE /api/quick-replies/[id] — soft delete via deletedAt.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateRequest(req)
    const { id } = await params

    const existing = await loadOwned(id, auth.organizationId)
    if (!existing) return apiError(404, 'Resposta rápida não encontrada.')
    await assertCanMutate(existing, auth)

    await db.update(quickReplies).set({ deletedAt: new Date() }).where(eq(quickReplies.id, id))
    return Response.json({ success: true })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
