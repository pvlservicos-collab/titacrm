import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { integrations } from '@/lib/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { situacaoDaLinha } from '@/lib/evolutionLinhas'

/** As linhas da Evolution da organização (Michele, Augusto, Cau) e se estão conectadas. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    const linhas = await db
      .select({ id: integrations.id, name: integrations.name, config: integrations.config })
      .from(integrations)
      .where(and(
        eq(integrations.organizationId, auth.organizationId),
        eq(integrations.type, 'whatsapp_evolution'),
        isNull(integrations.deletedAt)
      ))
      .orderBy(asc(integrations.createdAt))

    // `?leve=1`: só quem são as linhas, sem perguntar à Evolution se estão
    // conectadas (o card do lead só precisa dos nomes).
    const leve = req.nextUrl.searchParams.get('leve') === '1'
    const data = await Promise.all(linhas.map(async (l) => ({
      id: l.id,
      nome: l.name,
      instanceName: (l.config as { instanceName?: string } | null)?.instanceName ?? null,
      numeroEsperado: (l.config as { numeroEsperado?: string } | null)?.numeroEsperado ?? null,
      ...(leve ? {} : await situacaoDaLinha(auth.organizationId, l.id)),
    })))
    return Response.json({ data })
  } catch (err: any) { return apiError(err.status || 500, err.message || 'Erro interno.') }
}
