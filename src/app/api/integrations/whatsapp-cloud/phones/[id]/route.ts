/**
 * POST /api/integrations/whatsapp-cloud/phones/[id]
 * Body: { acao: 'registrar' | 'descadastrar' | 'pedir-codigo' | 'verificar-codigo' | 'usar', codigo?, metodo? }
 *
 * Só age em número que pertence à WABA conectada — o id vem da URL, então é
 * conferido contra a lista da própria Meta antes de qualquer chamada.
 * 'usar' troca o número por onde o CRM envia (phone_number_id da integração).
 */
import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { exigirGestaoDeIntegracoes } from '@/lib/admin-auth'
import { numerosDaWaba, registrarNumero, descadastrarNumero, pedirCodigo, verificarCodigo } from '@/lib/meta'
import { exigirIntegracaoCloud, salvarIntegracaoCloud } from '@/lib/whatsappIntegracao'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    await exigirGestaoDeIntegracoes(auth)
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const acao = body?.acao as string

    const integ = await exigirIntegracaoCloud(auth.organizationId)
    const numeros = await numerosDaWaba(integ.wabaId, integ.token)
    if (!numeros.some((n) => n.id === id)) return apiError(404, 'Número não pertence à conta conectada.')

    // Numero em coexistencia (tambem no aplicativo WhatsApp Business): registrar
    // ou descadastrar pela API desfaz o vinculo com o aplicativo do celular.
    if (integ.config.coexistencia && id === integ.config.phone_number_id && (acao === 'registrar' || acao === 'descadastrar')) {
      return apiError(400, 'Este número está em coexistência com o aplicativo WhatsApp Business. Registrar ou descadastrar pela API tiraria o número do celular.')
    }

    switch (acao) {
      case 'registrar':
        await registrarNumero(id, integ.token)
        break
      case 'descadastrar':
        await descadastrarNumero(id, integ.token)
        break
      case 'pedir-codigo':
        await pedirCodigo(id, integ.token, body?.metodo === 'VOICE' ? 'VOICE' : 'SMS')
        break
      case 'verificar-codigo': {
        const codigo = String(body?.codigo || '').replace(/\D/g, '')
        if (codigo.length !== 6) return apiError(400, 'O código tem 6 dígitos.')
        await verificarCodigo(id, integ.token, codigo)
        break
      }
      case 'usar':
        await salvarIntegracaoCloud(auth.organizationId, { ...integ.config, phone_number_id: id }, integ.token)
        break
      default:
        return apiError(400, 'Ação inválida.')
    }
    return Response.json({ ok: true })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
