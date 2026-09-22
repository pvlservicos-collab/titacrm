/**
 * As etapas do Kanban que o CRM move sozinho, e quando.
 *
 * A jornada tem três marcos automáticos, e a diferença entre eles é quem agiu:
 *
 *   Contactado por IA    → a automação mandou a mensagem de boas-vindas
 *   Lead respondeu IA    → a PESSOA respondeu
 *   Atendimento por humano → alguém do time respondeu pra ela
 *
 * O nome das etapas é editável no painel, então nada aqui pode depender de id
 * fixo: a busca é por nome, e quem não encontrar não move ninguém (em vez de
 * jogar o lead numa etapa errada).
 *
 * Existiu um caso feio dos dois lados disso: o funil movia TODO lead pra
 * "Atendimento por humano" assim que a mensagem automática saía — a coluna
 * ficou com 220 pessoas que ninguém tinha atendido — enquanto o código que
 * deveria mover de verdade procurava uma etapa chamada "Em atendimento", que
 * não existe neste pipeline. Ou seja: movia quem não devia e não movia quem
 * devia.
 */
import { and, eq, ilike, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, pipelineStages } from '@/lib/schema'
import {
  ETAPA_CONTACTADO_IA,
  ETAPA_LEAD_RESPONDEU,
  ETAPA_ATENDIMENTO_HUMANO,
} from '@/lib/etapasNomes'

export {
  ETAPA_CONTACTADO_IA,
  ETAPA_LEAD_RESPONDEU,
  ETAPA_ATENDIMENTO_HUMANO,
  ORDEM_DA_JORNADA,
} from '@/lib/etapasNomes'

/** Etapa pelo nome (o nome é editável no painel; id fixo aqui seria frágil). */
export async function acharEtapaPorNome(organizationId: string, nome: string) {
  const [etapa] = await db
    .select({ id: pipelineStages.id, rank: pipelineStages.rank })
    .from(pipelineStages)
    .where(and(
      eq(pipelineStages.organizationId, organizationId),
      isNull(pipelineStages.deletedAt),
      ilike(pipelineStages.name, nome)
    ))
    .limit(1)
  return etapa
}

/**
 * Move o lead para a etapa informada, se fizer sentido.
 *
 * Não mexe em quem está fora do Kanban (lead sem etapa é conversa importada,
 * não card), nem em grupo, nem em quem já passou dessa fase — quem está em
 * "Call com Augusto" não volta pra "Atendimento por humano" porque respondeu
 * mais uma mensagem.
 */
export async function moverParaEtapa(
  organizationId: string,
  leadId: string,
  nomeDaEtapa: string
): Promise<boolean> {
  const destino = await acharEtapaPorNome(organizationId, nomeDaEtapa)
  if (!destino) return false

  const [lead] = await db
    .select({ id: leads.id, stageId: leads.stageId, isGroup: leads.isGroup })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId), isNull(leads.deletedAt)))
    .limit(1)
  if (!lead || lead.isGroup || !lead.stageId) return false
  if (lead.stageId === destino.id) return false

  // Só avança: compara pela posição da etapa atual no Kanban.
  const [atual] = await db
    .select({ rank: pipelineStages.rank })
    .from(pipelineStages)
    .where(eq(pipelineStages.id, lead.stageId))
    .limit(1)
  if (atual && Number(atual.rank) > Number(destino.rank)) return false

  await db.update(leads).set({ stageId: destino.id, updatedAt: new Date() }).where(eq(leads.id, lead.id))
  return true
}

/** Marcos da jornada, pra quem não quer lembrar o nome exato da etapa. */
export const avancarJornada = {
  contactadoPorIA: (org: string, leadId: string) => moverParaEtapa(org, leadId, ETAPA_CONTACTADO_IA),
  leadRespondeu: (org: string, leadId: string) => moverParaEtapa(org, leadId, ETAPA_LEAD_RESPONDEU),
  humanoRespondeu: (org: string, leadId: string) => moverParaEtapa(org, leadId, ETAPA_ATENDIMENTO_HUMANO),
}
