import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { conectarLinha } from '@/lib/evolutionLinhas'

/** Gera o QR Code pra conectar a linha (cria a instância se ainda não existir). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    // Conectar um número é coisa de gente logada no CRM, nunca de token de API.
    if (!auth.memberId) return apiError(403, 'Só uma pessoa logada no CRM conecta um número.')
    const { id } = await params
    return Response.json({ data: await conectarLinha(auth.organizationId, id) })
  } catch (err: any) { return apiError(err.status || 500, err.message || 'Erro interno.') }
}
