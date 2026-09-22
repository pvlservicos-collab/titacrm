/**
 * Relatório diário no grupo do WhatsApp — sai às 7h (Brasília) com o dia
 * anterior fechado.
 *
 * A janela é das 23h de anteontem às 23h de ontem: o dia "de trabalho" fecha
 * às 23h, e o resumo chega de manhã, na hora em que o time começa. O relatório
 * tem dois tipos de
 * número, de propósito:
 *
 *   - SITE, AGENDA e "entraram no pipeline" contam os LEADS DO DIA: quem chegou
 *     na janela, e até onde cada um foi. É o funil de quem entrou hoje.
 *   - CRM (automação, atendimento humano, call, venda) conta o que ACONTECEU no
 *     dia, com qualquer lead. Se fosse só com os leads do dia, call e venda
 *     seriam quase sempre zero às 23h — ninguém agenda call no dia em que chega.
 *
 * "Terminou o formulário" é o mesmo critério da aba Leads, do funil e do card
 * de lead especial: vale o lead OU o cadastro, o que tiver a resposta.
 *
 * Linhas "(em construção)" são as que o CRM não mede: visita e clique
 * acontecem no WordPress, fora daqui.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { integrations } from '@/lib/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { ZAPI_INTEGRATION_TYPE, sendZapiMessage } from '@/lib/zapi'

export interface NumerosDoRelatorio {
  site: { comecouFormulario: number; formularioPreenchido: number }
  agenda: { preencheuContato: number; gerouAgenda: number; formularioPreenchido: number }
  crm: {
    pipelineAgenda: number
    pipelineSite: number
    automacao: number
    humano: number
    call: number
    vendas: number
  }
}

const HORA_DO_CORTE = 23 // Brasília
const FUSO_MS = -3 * 3600e3 // Brasília não tem mais horário de verão

/**
 * A última janela [23h, 23h) já fechada, no horário de Brasília.
 *
 * Às 7h de 23/09 é a de 21/09 23h → 22/09 23h. Rodando depois das 22h, fecha a
 * do próprio dia (é o que permite mudar o horário de volta sem mexer aqui).
 */
export function janelaDoDia(agora = new Date()): { inicio: Date; fim: Date } {
  const local = new Date(agora.getTime() + FUSO_MS)
  // Depois das 23h já é a janela de "amanhã"; o relatório das 23h fecha a de hoje.
  const fimLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), HORA_DO_CORTE)
  const fim = new Date(fimLocal - FUSO_MS)
  if (fim.getTime() > agora.getTime() + 60 * 60e3) {
    // Rodou antes das 22h: fecha a janela que terminou ontem às 23h.
    fim.setTime(fim.getTime() - 24 * 3600e3)
  }
  return { inicio: new Date(fim.getTime() - 24 * 3600e3), fim }
}

function dataBR(d: Date): string {
  const local = new Date(d.getTime() + FUSO_MS)
  return `${String(local.getUTCDate()).padStart(2, '0')}/${String(local.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Os números. `inicio` null = desde o começo (o relatório "total até hoje").
 */
export async function numerosDoRelatorio(
  organizationId: string,
  inicio: Date | null,
  fim: Date
): Promise<NumerosDoRelatorio> {
  const de = inicio ? inicio.toISOString() : '-infinity'
  const ate = fim.toISOString()

  // Campo preenchido no lead OU no cadastro (o reenvio antigo atualizava só um).
  const tem = (chave: string) =>
    sql.raw(`(nullif(trim(l.custom_attributes->>'${chave}'), '') IS NOT NULL OR nullif(trim(s.payload->>'${chave}'), '') IS NOT NULL)`)
  const formAgenda = sql`(${tem('area')} OR ${tem('aumento')} OR ${tem('investimento')})`
  const formSite = sql`(${tem('area')} OR ${tem('aumento')} OR ${tem('investimento')} OR ${tem('objetivo_profissional')} OR ${tem('qualidade_vida')} OR ${tem('acompanhante')})`
  const gerou = sql.raw(`('done' IN (l.custom_attributes->>'phase', l.custom_attributes->>'fase', s.payload->>'phase', s.payload->>'fase'))`)
  const pessoa = sql.raw(`coalesce(s.lead_id::text, s.id::text)`)
  // Teste da equipe não entra na conta.
  const naoTeste = sql.raw(`s.name NOT ILIKE '%teste%'`)
  const naJanela = sql`s.received_at >= ${de}::timestamptz AND s.received_at < ${ate}::timestamptz`
  const entregue = sql.raw(`a.metadata->>'direction' = 'outbound'
    AND coalesce(a.metadata->>'nao_entregue', 'false') <> 'true'
    AND coalesce(a.metadata->>'send_status', '') <> 'failed'`)
  const atividadeNaJanela = sql`a.created_at >= ${de}::timestamptz AND a.created_at < ${ate}::timestamptz`
  const moveuNaJanela = sql`h.moved_at >= ${de}::timestamptz AND h.moved_at < ${ate}::timestamptz`

  const { rows } = await db.execute(sql`
    SELECT
      (SELECT count(DISTINCT ${pessoa}) FROM lead_source_submissions s LEFT JOIN leads l ON l.id = s.lead_id
        WHERE s.organization_id = ${organizationId} AND s.source = 'site_evento' AND ${naJanela} AND ${naoTeste}
          AND s.phone IS NOT NULL) AS site_comecou,
      (SELECT count(DISTINCT ${pessoa}) FROM lead_source_submissions s LEFT JOIN leads l ON l.id = s.lead_id
        WHERE s.organization_id = ${organizationId} AND s.source = 'site_evento' AND ${naJanela} AND ${naoTeste}
          AND ${formSite}) AS site_form,

      (SELECT count(DISTINCT ${pessoa}) FROM lead_source_submissions s LEFT JOIN leads l ON l.id = s.lead_id
        WHERE s.organization_id = ${organizationId} AND s.source = 'agenda_ascensao' AND ${naJanela} AND ${naoTeste}) AS agenda_contato,
      (SELECT count(DISTINCT ${pessoa}) FROM lead_source_submissions s LEFT JOIN leads l ON l.id = s.lead_id
        WHERE s.organization_id = ${organizationId} AND s.source = 'agenda_ascensao' AND ${naJanela} AND ${naoTeste}
          AND (${gerou} OR ${formAgenda})) AS agenda_gerou,
      (SELECT count(DISTINCT ${pessoa}) FROM lead_source_submissions s LEFT JOIN leads l ON l.id = s.lead_id
        WHERE s.organization_id = ${organizationId} AND s.source = 'agenda_ascensao' AND ${naJanela} AND ${naoTeste}
          AND ${formAgenda}) AS agenda_form,

      (SELECT count(DISTINCT s.lead_id) FROM lead_source_submissions s JOIN leads l ON l.id = s.lead_id
        WHERE s.organization_id = ${organizationId} AND s.source = 'agenda_ascensao' AND ${naJanela} AND ${naoTeste}
          AND l.deleted_at IS NULL AND l.stage_id IS NOT NULL) AS pipeline_agenda,
      (SELECT count(DISTINCT s.lead_id) FROM lead_source_submissions s JOIN leads l ON l.id = s.lead_id
        WHERE s.organization_id = ${organizationId} AND s.source = 'site_evento' AND ${naJanela} AND ${naoTeste}
          AND l.deleted_at IS NULL AND l.stage_id IS NOT NULL) AS pipeline_site,

      (SELECT count(DISTINCT a.lead_id) FROM lead_activities a JOIN leads l ON l.id = a.lead_id
        WHERE a.organization_id = ${organizationId} AND ${atividadeNaJanela} AND ${entregue}
          AND a.metadata->>'source' = 'funnel' AND NOT coalesce(l.is_group, false)) AS automacao,
      (SELECT count(DISTINCT a.lead_id) FROM lead_activities a JOIN leads l ON l.id = a.lead_id
        WHERE a.organization_id = ${organizationId} AND ${atividadeNaJanela} AND ${entregue}
          AND a.metadata->>'source' = 'human' AND NOT coalesce(l.is_group, false)
          AND l.title NOT ILIKE '%teste%') AS humano,

      (SELECT count(DISTINCT h.lead_id) FROM lead_stage_history h JOIN pipeline_stages st ON st.id = h.to_stage_id
        WHERE h.organization_id = ${organizationId} AND ${moveuNaJanela}
          AND st.name IN ('Call com SDR', 'Call com Augusto')) AS calls,
      (SELECT count(DISTINCT h.lead_id) FROM lead_stage_history h JOIN pipeline_stages st ON st.id = h.to_stage_id
        WHERE h.organization_id = ${organizationId} AND ${moveuNaJanela}
          AND st.name = 'Comprou produto') AS vendas
  `)

  const r = (rows[0] ?? {}) as Record<string, string | number>
  const n = (k: string) => Number(r[k] ?? 0)
  return {
    site: { comecouFormulario: n('site_comecou'), formularioPreenchido: n('site_form') },
    agenda: { preencheuContato: n('agenda_contato'), gerouAgenda: n('agenda_gerou'), formularioPreenchido: n('agenda_form') },
    crm: {
      pipelineAgenda: n('pipeline_agenda'),
      pipelineSite: n('pipeline_site'),
      automacao: n('automacao'),
      humano: n('humano'),
      call: n('calls'),
      vendas: n('vendas'),
    },
  }
}

const EM_CONSTRUCAO = '_(em construção)_'

export function textoDoRelatorio(num: NumerosDoRelatorio, titulo: string, subtitulo: string): string {
  return [
    `📊 *${titulo}*`,
    subtitulo,
    '',
    `🌐 *Visitas no site:* ${EM_CONSTRUCAO}`,
    `- Clicaram no botão: ${EM_CONSTRUCAO}`,
    `- Começou formulário: *${num.site.comecouFormulario}*`,
    `- Formulário preenchido site: *${num.site.formularioPreenchido}*`,
    '',
    `📅 *Visitas na agenda:* ${EM_CONSTRUCAO}`,
    `- Preencheu 1º contato: *${num.agenda.preencheuContato}*`,
    `- Gerou agenda: *${num.agenda.gerouAgenda}*`,
    `- Começou formulário final: ${EM_CONSTRUCAO}`,
    `- Formulário preenchido agenda: *${num.agenda.formularioPreenchido}*`,
    '',
    '💼 *CRM*',
    `- Entraram no pipeline: *${num.crm.pipelineAgenda + num.crm.pipelineSite}*`,
    `   • Agenda: ${num.crm.pipelineAgenda}`,
    `   • Site: ${num.crm.pipelineSite}`,
    `- Receberam automação da IA: *${num.crm.automacao}*`,
    `- Receberam atendimento humano: *${num.crm.humano}*`,
    `- Agendaram uma call: *${num.crm.call}*`,
    `- Vendas: *${num.crm.vendas}*`,
  ].join('\n')
}

/** Grupo do relatório (config da Z-API), ou null se desligado. */
async function integracaoDoRelatorio(organizationId: string) {
  const [integracao] = await db
    .select({ id: integrations.id, config: integrations.config })
    .from(integrations)
    .where(and(
      eq(integrations.organizationId, organizationId),
      eq(integrations.type, ZAPI_INTEGRATION_TYPE),
      isNull(integrations.deletedAt)
    ))
    .limit(1)
  const grupo = (integracao?.config as Record<string, unknown> | undefined)?.relatorio_diario_grupo
  return integracao && typeof grupo === 'string' && grupo ? { id: integracao.id, grupo } : null
}

/**
 * Manda o relatório do dia, uma vez só por dia.
 *
 * A marca `relatorio_diario_enviado` (a data de Brasília) é tomada num UPDATE
 * condicional antes de enviar: o cron que roda duas vezes (reentrega da
 * Vercel) não manda duas mensagens. Se o envio falhar, a marca é desfeita pra
 * dar pra tentar de novo.
 */
export async function enviarRelatorioDoDia(
  organizationId: string,
  agora = new Date()
): Promise<{ enviado: boolean; motivo?: string }> {
  const destino = await integracaoDoRelatorio(organizationId)
  if (!destino) return { enviado: false, motivo: 'desligado' }

  const { inicio, fim } = janelaDoDia(agora)
  const dia = dataBR(fim)

  const { rows: trava } = await db.execute(sql`
    UPDATE integrations
       SET config = config || jsonb_build_object('relatorio_diario_enviado', ${dia}::text)
     WHERE id = ${destino.id}
       AND coalesce(config->>'relatorio_diario_enviado', '') <> ${dia}
    RETURNING id`)
  if (trava.length === 0) return { enviado: false, motivo: 'já enviado hoje' }

  try {
    const num = await numerosDoRelatorio(organizationId, inicio, fim)
    const texto = textoDoRelatorio(num, `Relatório diário — ${dia}`, `_Das 23h de ${dataBR(inicio)} às 23h de ${dia}_`)
    await sendZapiMessage(organizationId, destino.grupo, texto)
    return { enviado: true }
  } catch (err) {
    await db.execute(sql`UPDATE integrations SET config = config - 'relatorio_diario_enviado' WHERE id = ${destino.id}`)
    throw err
  }
}
