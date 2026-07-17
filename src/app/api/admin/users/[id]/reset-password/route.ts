import { NextRequest } from 'next/server'
import { requireSuperadmin, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { users } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

// POST /api/admin/users/[id]/reset-password — gera uma senha temporária nova pro
// usuário (fluxo de suporte: o founder reseta e repassa a senha por fora). Não há
// e-mail transacional no projeto (confirmado — nenhuma lib de envio configurada),
// então a senha em texto plano só existe nesta resposta, uma vez, pra ser repassada
// manualmente; nunca é logada nem persistida em lugar nenhum.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperadmin()
    const { id } = await params

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
    if (!user) return apiError(404, 'Usuário não encontrado.')

    const newPassword = crypto.randomBytes(9).toString('base64url')
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id))

    return Response.json({ success: true, newPassword })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
