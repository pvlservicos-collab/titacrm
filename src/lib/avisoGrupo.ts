/**
 * Aviso num grupo do WhatsApp quando um lead responde a mensagem automática.
 *
 * É o complemento humano do funil: a mensagem da Michele sai sozinha, e a
 * resposta do lead é o momento em que alguém do time precisa entrar na
 * conversa. O som grande avisa quem está com o CRM aberto; o grupo avisa quem
 * está com o celular na mão.
 *
 * Liga e desliga pela configuração da integração Z-API
 * (`integrations.config.aviso_resposta_grupo` = id do grupo, ou ausente). Fica
 * na configuração e não no código porque é temporário por natureza — o pedido
 * foi "por enquanto, depois desativo" — e desligar não pode depender de deploy.
 * A tela da Z-API tem o interruptor.
 */
import { db } from '@/lib/db'
import { integrations, leads, leadSourceSubmissions } from '@/lib/schema'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { ZAPI_INTEGRATION_TYPE, sendZapiMessage } from '@/lib/zapi'
import { LEAD_SOURCES, isLeadSourceKey } from '@/lib/leadSources'
import { getBaseUrl } from '@/lib/funnel-engine'
import { linkDaConversa } from '@/lib/links'

/**
 * Grupo configurado na Z-API para um tipo de aviso, ou null se desligado.
 *
 * Cada aviso tem a sua chave: dá pra desligar o de resposta (que era "por
 * enquanto") sem perder o de formulário concluído, e vice-versa.
 */
async function grupoDoAviso(
  organizationId: string,
  chave: 'aviso_resposta_grupo' | 'aviso_formulario_grupo'
): Promise<string | null> {
  const [integracao] = await db
    .select({ config: integrations.config })
    .from(integrations)
    .where(and(
      eq(integrations.organizationId, organizationId),
      eq(integrations.type, ZAPI_INTEGRATION_TYPE),
      isNull(integrations.deletedAt)
    ))
    .limit(1)
  const grupo = (integracao?.config as Record<string, unknown> | undefined)?.[chave]
  return typeof grupo === 'string' && grupo ? grupo : null
}

/** "5511987654321" → "(11) 98765-4321". */
function telefoneLegivel(phone: string | null): string {
  const d = (phone || '').replace(/\D/g, '')
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return phone || '—'
}

function fonteDoLead(attrs?: Record<string, unknown> | null): string {
  const chave = String(attrs?.lead_source ?? '')
  return isLeadSourceKey(chave) ? LEAD_SOURCES[chave].label : 'WhatsApp'
}

/**
 * Manda o aviso, se estiver ligado. Nunca lança: é um recado pro time, e
 * falhar aqui não pode derrubar o registro da mensagem do lead, que é o que
 * importa de verdade.
 */
export async function avisarGrupoRespostaAutomacao(
  organizationId: string,
  leadId: string,
  resposta: string
): Promise<void> {
  try {
    // Busca aqui em vez de receber pronto: quem chama (a entrada de mensagem)
    // não carrega custom_attributes, e a fonte do lead vem de lá.
    const [lead] = await db
      .select({ id: leads.id, title: leads.title, phone: leads.phone, customAttributes: leads.customAttributes })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1)
    if (!lead) return

    const grupo = await grupoDoAviso(organizationId, 'aviso_resposta_grupo')
    if (!grupo) return // desligado

    // Trecho curto: o grupo é pra chamar atenção, a conversa inteira está no CRM.
    const trecho = resposta.length > 160 ? resposta.slice(0, 157) + '…' : resposta

    const texto = [
      '🔔 *Lead respondeu a mensagem automática*',
      '',
      `👤 ${lead.title || 'Sem nome'}`,
      `📱 ${telefoneLegivel(lead.phone)}`,
      `📍 ${fonteDoLead(lead.customAttributes as Record<string, unknown> | null)}`,
      '',
      `💬 "${trecho}"`,
      '',
      `Abrir no CRM: ${getBaseUrl()}${linkDaConversa(lead.id)}`,
    ].join('\n')

    await sendZapiMessage(organizationId, grupo, texto)
  } catch (err) {
    console.error('[aviso-grupo] não consegui avisar o grupo:', err)
  }
}

/** Campos do formulário final, na ordem do card. Rótulos iguais aos da aba Leads. */
const CAMPOS_DO_CARD: { chave: string; rotulo: string; emoji: string; so?: 'agenda' | 'site' }[] = [
  { chave: 'area', rotulo: 'Área', emoji: '💼' },
  { chave: 'aumento', rotulo: 'Aumento esperado', emoji: '📈' },
  { chave: 'investimento', rotulo: 'Já investiu', emoji: '💰' },
  { chave: 'objetivo_profissional', rotulo: 'Objetivo profissional', emoji: '🎯', so: 'site' },
  { chave: 'qualidade_vida', rotulo: 'Qualidade de vida', emoji: '🌿', so: 'site' },
  { chave: 'acompanhante', rotulo: 'Leva acompanhante', emoji: '👥', so: 'site' },
  { chave: 'procrastinacao', rotulo: 'Procrastinação', emoji: '⏳', so: 'agenda' },
  { chave: 'reunioes', rotulo: 'Reuniões', emoji: '📅', so: 'agenda' },
  { chave: 'trabalho', rotulo: 'Trabalho', emoji: '🕘', so: 'agenda' },
]

/** Os campos que dizem "terminou o formulário final" — os mesmos do funil e da etiqueta. */
export const CAMPOS_FORMULARIO_FINAL = ['area', 'aumento', 'investimento']

function temValor(v: unknown): boolean {
  return typeof v === 'string' ? v.trim() !== '' : typeof v === 'number'
}

/*
 * LEAD ESPECIAL — quem vai até o fim do formulário final (o da Agenda ou o de
 * aplicação do site, os dois que perguntam a área/profissão). Respondeu tudo:
 * é o lead mais quente que existe, e o time fica sabendo pelo grupo com um
 * card das respostas.
 *
 * Três marcas em custom_attributes, e nenhuma se perde:
 *
 *   aviso_formulario_pendente   o lead concluiu, o card ainda não saiu
 *   aviso_formulario_tentativa  última tentativa de envio (trava + espera)
 *   aviso_formulario_em         o card saiu — nunca mais sai de novo
 *
 * "Enviado" só é gravado DEPOIS que a Z-API aceitou. Com o WhatsApp fora do ar
 * a pendência fica, e o tick (/api/funnels/tick, todo minuto) tenta de novo a
 * cada 5 min, por até 48 h — card mais velho que isso já não é aviso, é
 * histórico. A tentativa é tomada num UPDATE condicional: dois caminhos ao
 * mesmo tempo (o reenvio da Agenda e o tick) não mandam o card duas vezes.
 */

const ESPERA_ENTRE_TENTATIVAS = "interval '5 minutes'"
const VALIDADE_DA_PENDENCIA = "interval '48 hours'"

/**
 * Marca o lead como especial (card pendente). Idempotente: quem já está
 * pendente ou já foi avisado não muda.
 */
export async function marcarLeadEspecial(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({
      customAttributes: sql`coalesce(${leads.customAttributes}, '{}'::jsonb) || jsonb_build_object('aviso_formulario_pendente', now())`,
    })
    .where(and(
      eq(leads.id, leadId),
      sql`NOT (coalesce(${leads.customAttributes}, '{}'::jsonb) ?| array['aviso_formulario_pendente', 'aviso_formulario_em'])`
    ))
}

/**
 * Tenta mandar o card de UM lead pendente. Nunca lança.
 *
 * Devolve true só se o card saiu agora.
 */
export async function avisarGrupoFormularioConcluido(organizationId: string, leadId: string): Promise<boolean> {
  try {
    const grupo = await grupoDoAviso(organizationId, 'aviso_formulario_grupo')
    if (!grupo) return false // desligado: a pendência fica até vencer

    // Toma a vez. Falha se já foi enviado, se não está pendente, se a
    // pendência venceu ou se outra tentativa rolou há menos de 5 min.
    const [lead] = await db
      .update(leads)
      .set({
        customAttributes: sql`${leads.customAttributes} || jsonb_build_object('aviso_formulario_tentativa', now())`,
      })
      .where(and(
        eq(leads.id, leadId),
        isNull(leads.deletedAt),
        sql`${leads.customAttributes} ? 'aviso_formulario_pendente'`,
        sql`NOT (${leads.customAttributes} ? 'aviso_formulario_em')`,
        sql`(${leads.customAttributes}->>'aviso_formulario_pendente')::timestamptz > now() - ${sql.raw(VALIDADE_DA_PENDENCIA)}`,
        sql`(NOT (${leads.customAttributes} ? 'aviso_formulario_tentativa')
             OR (${leads.customAttributes}->>'aviso_formulario_tentativa')::timestamptz < now() - ${sql.raw(ESPERA_ENTRE_TENTATIVAS)})`
      ))
      .returning({ id: leads.id, title: leads.title, phone: leads.phone, customAttributes: leads.customAttributes })
    if (!lead) return false

    const attrs = (lead.customAttributes ?? {}) as Record<string, unknown>
    const fonte = attrs.lead_source === 'site_evento' ? 'site' : 'agenda'

    // O @ da Agenda fica no cadastro, não no lead.
    const [cadastro] = await db
      .select({ instagram: leadSourceSubmissions.instagram })
      .from(leadSourceSubmissions)
      .where(eq(leadSourceSubmissions.leadId, leadId))
      .orderBy(desc(leadSourceSubmissions.updatedAt))
      .limit(1)
    const instagram = cadastro?.instagram || (attrs.instagram_username as string | undefined) || null

    const linhas = [
      '⭐ *LEAD ESPECIAL*',
      fonte === 'site' ? 'Concluiu o formulário do *SITE* até o fim' : 'Concluiu o formulário da *AGENDA* até o fim',
      '',
      `👤 ${lead.title || 'Sem nome'}`,
      `📱 ${telefoneLegivel(lead.phone)}`,
      ...(instagram ? [`📸 ${instagram.startsWith('@') ? instagram : '@' + instagram}`] : []),
      '',
      ...CAMPOS_DO_CARD
        .filter((c) => (!c.so || c.so === fonte) && temValor(attrs[c.chave]))
        .map((c) => `${c.emoji} *${c.rotulo}:* ${String(attrs[c.chave]).trim()}`),
      '',
      `Abrir no CRM: ${getBaseUrl()}${linkDaConversa(lead.id)}`,
    ]

    await sendZapiMessage(organizationId, grupo, linhas.join('\n'))

    await db
      .update(leads)
      .set({
        customAttributes: sql`(${leads.customAttributes} - 'aviso_formulario_pendente' - 'aviso_formulario_tentativa') || jsonb_build_object('aviso_formulario_em', now())`,
      })
      .where(eq(leads.id, leadId))
    return true
  } catch (err) {
    // A pendência continua: o tick tenta de novo em 5 min.
    console.error('[aviso-grupo] card do lead especial não saiu (tenta de novo no tick):', err)
    return false
  }
}

/**
 * Chamado pelo tick: manda os cards que ficaram pendentes (WhatsApp estava fora
 * do ar, a função caiu no meio). Poucos por vez — é recado, não disparo.
 */
export async function enviarCardsPendentes(): Promise<{ tentados: number; enviados: number }> {
  const pendentes = await db
    .select({ id: leads.id, organizationId: leads.organizationId })
    .from(leads)
    .where(and(
      isNull(leads.deletedAt),
      sql`${leads.customAttributes} ? 'aviso_formulario_pendente'`,
      sql`NOT (${leads.customAttributes} ? 'aviso_formulario_em')`,
      sql`(${leads.customAttributes}->>'aviso_formulario_pendente')::timestamptz > now() - ${sql.raw(VALIDADE_DA_PENDENCIA)}`,
      sql`(NOT (${leads.customAttributes} ? 'aviso_formulario_tentativa')
           OR (${leads.customAttributes}->>'aviso_formulario_tentativa')::timestamptz < now() - ${sql.raw(ESPERA_ENTRE_TENTATIVAS)})`
    ))
    .limit(10)

  let enviados = 0
  for (const lead of pendentes) {
    if (await avisarGrupoFormularioConcluido(lead.organizationId, lead.id)) enviados++
  }
  return { tentados: pendentes.length, enviados }
}
