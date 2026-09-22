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

/**
 * Card no grupo quando o lead termina o formulário final — o da Agenda ou o de
 * aplicação do site, os dois que perguntam a área/profissão.
 *
 * É o lead mais quente que existe: respondeu tudo. O card leva as respostas
 * pra quem está no celular decidir ali mesmo quem chama e como.
 *
 * Uma vez por lead. A marca `aviso_formulario_em` é gravada ANTES de enviar,
 * num UPDATE condicional — dois reenvios chegando juntos (a Agenda manda o
 * mesmo cadastro mais de uma vez) não conseguem os dois passar pela trava. Se
 * o envio falhar, a marca fica: melhor perder um card do que o grupo receber
 * o mesmo lead duas vezes a cada reenvio.
 *
 * Nunca lança, pelo mesmo motivo do aviso de resposta.
 */
export async function avisarGrupoFormularioConcluido(organizationId: string, leadId: string): Promise<void> {
  try {
    const grupo = await grupoDoAviso(organizationId, 'aviso_formulario_grupo')
    if (!grupo) return // desligado

    const [lead] = await db
      .select({ id: leads.id, title: leads.title, phone: leads.phone, customAttributes: leads.customAttributes })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1)
    if (!lead) return
    const attrs = (lead.customAttributes ?? {}) as Record<string, unknown>
    if (!CAMPOS_FORMULARIO_FINAL.some((c) => temValor(attrs[c]))) return

    const fonte = attrs.lead_source === 'site_evento' ? 'site' : 'agenda'

    const [travou] = await db
      .update(leads)
      .set({
        customAttributes: sql`coalesce(${leads.customAttributes}, '{}'::jsonb) || jsonb_build_object('aviso_formulario_em', now())`,
      })
      .where(and(eq(leads.id, leadId), sql`NOT (coalesce(${leads.customAttributes}, '{}'::jsonb) ? 'aviso_formulario_em')`))
      .returning({ id: leads.id })
    if (!travou) return // já avisado

    // O @ da Agenda fica no cadastro, não no lead.
    const [cadastro] = await db
      .select({ instagram: leadSourceSubmissions.instagram })
      .from(leadSourceSubmissions)
      .where(eq(leadSourceSubmissions.leadId, leadId))
      .orderBy(desc(leadSourceSubmissions.updatedAt))
      .limit(1)
    const instagram = cadastro?.instagram || (attrs.instagram_username as string | undefined) || null

    const linhas = [
      fonte === 'site' ? '🏆 *Lead concluiu o formulário do SITE*' : '🏆 *Lead concluiu o formulário da AGENDA*',
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
  } catch (err) {
    console.error('[aviso-grupo] não consegui mandar o card do formulário:', err)
  }
}
