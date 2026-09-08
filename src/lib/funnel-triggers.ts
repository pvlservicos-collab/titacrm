/**
 * Liga as fontes de lead (src/lib/leadSources.ts) aos funis de mensagem.
 *
 * Fica separado de funnel-engine.ts de propósito: o engine não sabe nada sobre
 * de onde o lead veio, e a ingestão não sabe nada sobre blocos e execuções.
 * Este módulo é a única coisa que conhece os dois lados.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { messageFunnels } from '@/lib/schema'
import { startExecution } from '@/lib/funnel-engine'
import type { LeadSourceKey } from '@/lib/leadSources'

/**
 * Gatilho de funil correspondente a cada fonte.
 *
 * Os nomes divergem (`site_evento` → `lead_site_evento`) porque o enum
 * `funnel_trigger` é compartilhado com os gatilhos antigos (`novo_pago` etc.) —
 * o prefixo `lead_` deixa claro, olhando só o valor no banco, que aquele gatilho
 * vem da entrada de um lead novo e não de um evento de pagamento.
 */
const TRIGGER_BY_SOURCE: Record<LeadSourceKey, string | null> = {
  site_evento: 'lead_site_evento',
  agenda_ascensao: 'lead_agenda_ascensao',
  // null de propósito: `agenda_antigos` é uma lista histórica importada por
  // planilha. Se ela disparasse o funil, importar o arquivo mandaria a mensagem
  // de boas-vindas pra centenas de pessoas cadastradas meses atrás — de uma vez.
  agenda_antigos: null,
}

export function triggerForSource(source: LeadSourceKey): string | null {
  return TRIGGER_BY_SOURCE[source]
}

/**
 * Inicia o funil de atendimento da fonte para um lead recém-criado.
 *
 * Só dispara funil ATIVO. Um funil desligado (ou inexistente) não é erro: é o
 * estado normal enquanto ninguém montou o fluxo daquela fonte ainda, então
 * devolve null em silêncio em vez de estourar na ingestão.
 *
 * Retorna o id da execução criada, ou null se não havia funil pra rodar.
 */
export async function startFunnelForSource(
  organizationId: string,
  source: LeadSourceKey,
  leadId: string
): Promise<string | null> {
  const trigger = TRIGGER_BY_SOURCE[source]
  if (!trigger) return null

  const [funnel] = await db
    .select({ id: messageFunnels.id })
    .from(messageFunnels)
    .where(and(
      eq(messageFunnels.organizationId, organizationId),
      eq(messageFunnels.trigger, trigger as any),
      eq(messageFunnels.isActive, true),
      isNull(messageFunnels.deletedAt)
    ))
    .limit(1)

  if (!funnel) return null

  return startExecution(funnel.id, organizationId, leadId, { source })
}
