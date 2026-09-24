/**
 * GET /api/integrations/whatsapp-cloud/phones
 * Números da WABA conectada, com status na Meta, e se a WABA tem forma de
 * pagamento (sem ela a Meta recusa template pago).
 */
import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { exigirGestaoDeIntegracoes } from '@/lib/admin-auth'
import { numerosDaWaba, wabaTemPagamento } from '@/lib/meta'
import { exigirIntegracaoCloud } from '@/lib/whatsappIntegracao'

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await exigirGestaoDeIntegracoes(auth)
    const { token, wabaId, config } = await exigirIntegracaoCloud(auth.organizationId)
    const [numeros, pagamento] = await Promise.all([numerosDaWaba(wabaId, token), wabaTemPagamento(wabaId, token)])
    return Response.json({
      waba_id: wabaId,
      phone_number_id_ativo: config.phone_number_id,
      coexistencia: !!config.coexistencia,
      pagamento,
      numeros,
    })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
