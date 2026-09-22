import { processTick } from '@/lib/funnel-engine'
import { enviarCardsPendentes } from '@/lib/avisoGrupo'

/**
 * GET/POST /api/funnels/tick
 * Processa todas as execuções de funis pendentes (esperas vencidas e checagens
 * de "Respondeu?"). Sem autenticação (uso interno) — chamado periodicamente
 * pelo Cron Job do Vercel (ver vercel.json) e também aceita POST manual.
 */
async function tick() {
  try {
    const result = await processTick()
    // Card do lead especial que não saiu na hora (WhatsApp fora do ar). Falhar
    // aqui não pode derrubar o tick dos funis.
    const cards = await enviarCardsPendentes().catch((err) => {
      console.error('[tick] cards pendentes:', err)
      return null
    })
    return Response.json({ status: 'ok', ...result, cards })
  } catch (err: any) {
    return Response.json({ status: 'error', message: err.message || 'Erro interno.' }, { status: 500 })
  }
}

export const GET = tick
export const POST = tick
