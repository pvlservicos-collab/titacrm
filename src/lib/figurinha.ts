import { db } from '@/lib/db'
import { leads, leadActivities, messageFunnels, pipelineStages, funnelExecutions, funnelBlocks, funnelConnections, tags, leadTags } from '@/lib/schema'
import { eq, and, isNull, ilike, asc, desc, sql, inArray } from 'drizzle-orm'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { publishEvent, channels, events } from '@/lib/realtime'
import { ORGANIZATION_ID } from '@/lib/automated-message'
import { startExecution, resolveConditionNow } from '@/lib/funnel-engine'
import { isUniqueViolation } from '@/lib/db-helpers'

/**
 * Mensagem enviada automaticamente quando o cliente pede a figurinha
 * (ex: "Quero minha figurinha Nº#96991712831"), enquanto ela é gerada.
 */
export const FIGURINHA_BUSCANDO_MESSAGE =
  'Olá! Já encontrei seu cadastro, buscando sua figurinha... (Aguarde 1 minuto) ⏳'

/**
 * Números de teste cuja figurinha já deve ser considerada pronta
 * imediatamente, sem aguardar o webhook externo de confirmação.
 */
export const FIGURINHA_READY_TEST_NUMBERS = new Set(['96991712831'])

/**
 * Extrai o número informado em mensagens do tipo
 * "Quero minha figurinha Nº#96991712831".
 */
export function extractFigurinhaNumero(text: string): string | null {
  // Estrutura fixa: "Quero minha figurinha" + "N" (de "Nº"/"Numero"/"Num"...) +
  // qualquer coisa curta sem dígitos + "#" + o número do cliente, sem mais nada antes/depois.
  const match = text.trim().match(/^Quero minha figurinha\s*N[^\d#]{0,9}#(\d{8,15})$/i)
  return match ? match[1] : null
}

export function buildFigurinhaProntaMessage(telefone: string) {
  const link = `https://gerarfigurinhas.vercel.app/figurinha/${telefone}`
  return `✅ Figurinha pronta!\n\nSua figurinha já está disponível, confira pelo link:\n${link}`
}

/**
 * Localiza o lead correspondente a um telefone informado em webhooks de
 * figurinha: 1) procura uma mensagem inbound contendo o número; 2) procura
 * pelo telefone do lead; 3) cria um novo lead.
 */
export async function findOrCreateLeadByFigurinhaPhone(telefone: string): Promise<{ id: string; phone: string | null }> {
  const [match] = await db.select({ leadId: leadActivities.leadId })
    .from(leadActivities)
    .where(and(
      eq(leadActivities.organizationId, ORGANIZATION_ID),
      sql`${leadActivities.metadata}->>'direction' = 'inbound'`,
      ilike(leadActivities.content, `%${telefone}%`),
    ))
    .orderBy(desc(leadActivities.createdAt))
    .limit(1)

  let leadId = match?.leadId

  if (!leadId) {
    const [leadByPhone] = await db.select({ id: leads.id })
      .from(leads)
      .where(and(
        eq(leads.organizationId, ORGANIZATION_ID),
        isNull(leads.deletedAt),
        ilike(leads.phone, `%${telefone}`),
      ))
      .limit(1)

    leadId = leadByPhone?.id
  }

  if (!leadId) {
    const [firstStage] = await db.select({ id: pipelineStages.id }).from(pipelineStages)
      .where(and(eq(pipelineStages.organizationId, ORGANIZATION_ID), isNull(pipelineStages.deletedAt)))
      .orderBy(asc(pipelineStages.rank)).limit(1)

    const phone = telefone.length <= 11 ? `55${telefone}` : telefone

    try {
      const [newLead] = await db.insert(leads).values({
        organizationId: ORGANIZATION_ID,
        title: phone,
        phone,
        stageId: firstStage?.id || null,
        lastActivityAt: new Date(),
        customAttributes: { source: 'geracaowhatsapp' },
      }).returning({ id: leads.id, phone: leads.phone })

      return { id: newLead.id, phone: newLead.phone }
    } catch (err) {
      // leads_org_phone_unique cobre corrida entre dois webhooks de figurinha quase
      // simultâneos pro mesmo telefone (gerada/página vista/abandono de preço podem
      // chegar em sequência muito rápida).
      if (!isUniqueViolation(err)) throw err
      const [raceLead] = await db.select({ id: leads.id, phone: leads.phone }).from(leads)
        .where(and(eq(leads.organizationId, ORGANIZATION_ID), eq(leads.phone, phone), isNull(leads.deletedAt)))
        .limit(1)
      if (!raceLead) throw err
      return raceLead
    }
  }

  const [lead] = await db.select({ id: leads.id, phone: leads.phone }).from(leads).where(eq(leads.id, leadId)).limit(1)
  return lead
}

/**
 * Garante que o lead tenha a tag "figurinha" (cria a tag na organização se
 * ainda não existir). Usado para marcar leads que entraram no funil de
 * geração de figurinha via WhatsApp.
 */
async function ensureFigurinhaTag(leadId: string) {
  let [tag] = await db.select({ id: tags.id }).from(tags)
    .where(and(eq(tags.organizationId, ORGANIZATION_ID), ilike(tags.name, 'figurinha')))
    .limit(1)

  if (!tag) {
    [tag] = await db.insert(tags).values({
      organizationId: ORGANIZATION_ID,
      name: 'figurinha',
      color: '#a855f7',
    }).returning({ id: tags.id })
  }

  await db.insert(leadTags).values({ leadId, tagId: tag.id, organizationId: ORGANIZATION_ID }).onConflictDoNothing()
}

/**
 * Atualiza o contexto das execuções de funil em andamento de um lead para os
 * gatilhos informados, mesclando os campos de `patch` (ex: { viu_pagina: true }).
 * Usado para sinalizar eventos externos (página vista, pagamento confirmado)
 * que serão checados pelas condições durante o `processTick`.
 */
export async function markFunnelExecutionContext(leadId: string, _trigger: string, patch: Record<string, any>) {
  const funnels = await db.select({ id: messageFunnels.id }).from(messageFunnels)
    .where(and(eq(messageFunnels.organizationId, ORGANIZATION_ID), eq(messageFunnels.isActive, true), isNull(messageFunnels.deletedAt)))

  if (funnels.length === 0) return

  const funnelIds = funnels.map(f => f.id)

  const executions = await db.select({ id: funnelExecutions.id, context: funnelExecutions.context })
    .from(funnelExecutions)
    .where(and(
      eq(funnelExecutions.leadId, leadId),
      inArray(funnelExecutions.funnelId, funnelIds),
      inArray(funnelExecutions.status, ['running', 'waiting', 'waiting_condition']),
    ))

  for (const exec of executions) {
    await db.update(funnelExecutions).set({
      context: { ...(exec.context as object), ...patch },
      updatedAt: new Date(),
    }).where(eq(funnelExecutions.id, exec.id))

    // Se o evento confirma a condição que a execução está esperando (visita à
    // página ou pagamento), resolve agora o ramo "yes" sem esperar o próximo
    // tick do cron, disparando a mensagem correspondente imediatamente.
    const resolvedConditionTypes: string[] = []
    if (patch.viu_pagina) resolvedConditionTypes.push('clique_pagina')
    if (patch.pagamento_confirmado) resolvedConditionTypes.push('pagamento')

    if (resolvedConditionTypes.length > 0) {
      const [current] = await db.select({ status: funnelExecutions.status, currentBlockId: funnelExecutions.currentBlockId })
        .from(funnelExecutions).where(eq(funnelExecutions.id, exec.id)).limit(1)

      if (current?.status === 'waiting_condition' && current.currentBlockId) {
        const [block] = await db.select({ config: funnelBlocks.config }).from(funnelBlocks)
          .where(eq(funnelBlocks.id, current.currentBlockId)).limit(1)

        if (resolvedConditionTypes.includes((block?.config as any)?.conditionType)) {
          await resolveConditionNow(exec.id, 'yes')
        }
      }
    }
  }
}

/**
 * Envia uma mensagem automática de texto para um lead, registra a atividade
 * no CRM, atualiza o lead e publica os eventos de tempo real.
 */
export async function sendFigurinhaAutoMessage(leadId: string, phone: string, content: string, source: string) {
  const metadata: Record<string, any> = {
    source,
    direction: 'outbound',
    automated: true,
  }

  try {
    const result = await sendWhatsAppMessage(ORGANIZATION_ID, phone, content)
    metadata.whatsapp_message_id = result?.messages?.[0]?.id
    metadata.send_status = 'sent'
  } catch (err: any) {
    metadata.send_status = 'failed'
    metadata.send_error = err.message || 'Erro ao enviar mensagem.'
  }

  const [activity] = await db.insert(leadActivities).values({
    organizationId: ORGANIZATION_ID,
    leadId,
    type: 'whatsapp',
    content,
    metadata,
  }).returning({ id: leadActivities.id })

  await db.update(leads).set({
    lastMessageContent: content,
    lastMessageSenderType: 'automated',
    lastActivityAt: new Date(),
    isUnread: true,
  }).where(eq(leads.id, leadId))

  await publishEvent(channels.leadActivities(leadId), events.ACTIVITY_CREATED, { id: activity.id })
  await publishEvent(channels.orgLeads(ORGANIZATION_ID), events.LEAD_UPDATED, { id: leadId })

  return metadata
}

/**
 * Dispara o funil ativo correspondente ao gatilho informado, passando o
 * telefone da figurinha no contexto da execução (usado por {link_figurinha}).
 * Se não houver funil ativo com esse gatilho, executa o fallback (mensagem fixa).
 */
/**
 * Substitui as variáveis dinâmicas de um texto de mensagem para fins de
 * preview/log (sem registrar cliques), usando o telefone informado.
 */
function renderForLog(text: string, leadTitle: string, telefone: string) {
  return (text || '')
    .replace(/\{nome\}/gi, leadTitle || '')
    .replace(/\{link_figurinha\}/gi, `https://gerarfigurinhas.vercel.app/figurinha/${telefone}`)
    .replace(/\{link_desconto\}/gi, `https://gerarfigurinhas.vercel.app/preview-desconto/${telefone}`)
    .replace(/\{link\}/gi, '(link rastreável)')
}

/**
 * Percorre todos os caminhos do funil (a partir de cada bloco "trigger") e
 * retorna o texto renderizado de cada bloco de mensagem encontrado, na ordem
 * em que apareceriam para o cliente. Usado para o log de monitoramento
 * enviado ao número de teste — mostra exatamente as mensagens do fluxo.
 */
async function collectFunnelMessageTexts(funnelId: string, telefone: string, leadTitle: string): Promise<string[]> {
  const blocks = await db.select().from(funnelBlocks).where(eq(funnelBlocks.funnelId, funnelId))
  const connections = await db.select().from(funnelConnections).where(eq(funnelConnections.funnelId, funnelId))
  const blockMap = new Map(blocks.map(b => [b.id, b]))
  const triggers = blocks.filter(b => b.type === 'trigger')

  const texts: string[] = []
  const visited = new Set<string>()

  function walk(blockId: string) {
    if (visited.has(blockId)) return
    visited.add(blockId)
    const block = blockMap.get(blockId)
    if (!block) return

    if (block.type === 'message') {
      texts.push(renderForLog((block.config as any)?.text || '', leadTitle, telefone))
    }
    if (block.type === 'end') return

    for (const conn of connections.filter(c => c.sourceBlockId === blockId)) {
      walk(conn.targetBlockId)
    }
  }

  for (const trigger of triggers) walk(trigger.id)

  return texts
}

/**
 * Monta a lista de mensagens (rendidas exatamente como seriam enviadas ao
 * cliente) de todos os funis ativos de figurinha. Enviada como várias
 * mensagens separadas apenas ao número de teste/monitoramento
 * (FIGURINHA_READY_TEST_NUMBERS), nunca para clientes reais.
 */
export async function buildFigurinhaFlowPreviewMessages(telefone: string, leadTitle: string): Promise<string[]> {
  const funnels = await db.select({ id: messageFunnels.id }).from(messageFunnels)
    .where(and(
      eq(messageFunnels.organizationId, ORGANIZATION_ID),
      eq(messageFunnels.isActive, true),
      isNull(messageFunnels.deletedAt),
    ))

  const texts: string[] = []
  for (const funnel of funnels) {
    texts.push(...await collectFunnelMessageTexts(funnel.id, telefone, leadTitle))
  }

  return texts
}

/**
 * Dispara, dentro dos funis ativos, a partir do bloco "trigger" cujo
 * `config.trigger` corresponde ao gatilho informado, passando o telefone da
 * figurinha no contexto da execução (usado por {link_figurinha}/{link_desconto}).
 * Se nenhum bloco "trigger" corresponder, executa o fallback (mensagem fixa).
 */
export async function runFigurinhaFunnel(
  trigger: 'pedido_figurinha' | 'geracaowhatsapp' | 'abandono_preco',
  leadId: string,
  telefone: string,
  fallback: () => Promise<unknown>
) {
  const funnels = await db.select({ id: messageFunnels.id }).from(messageFunnels)
    .where(and(
      eq(messageFunnels.organizationId, ORGANIZATION_ID),
      eq(messageFunnels.isActive, true),
      isNull(messageFunnels.deletedAt),
    ))

  let started = false

  for (const funnel of funnels) {
    // Limita a 2 execuções simultâneas do mesmo funil por lead (evita
    // acúmulo descontrolado de mensagens duplicadas em testes/triggers repetidos).
    const activeExecutions = await db.select({ id: funnelExecutions.id }).from(funnelExecutions)
      .where(and(
        eq(funnelExecutions.funnelId, funnel.id),
        eq(funnelExecutions.leadId, leadId),
        inArray(funnelExecutions.status, ['running', 'waiting', 'waiting_condition']),
      ))
    if (activeExecutions.length >= 1) {
      started = true
      continue
    }

    const triggerBlocks = await db.select({ id: funnelBlocks.id, config: funnelBlocks.config }).from(funnelBlocks)
      .where(and(eq(funnelBlocks.funnelId, funnel.id), eq(funnelBlocks.type, 'trigger')))

    for (const block of triggerBlocks) {
      if ((block.config as any)?.trigger === trigger) {
        await startExecution(funnel.id, ORGANIZATION_ID, leadId, { telefone }, block.id)
        started = true
        if (trigger === 'geracaowhatsapp') await ensureFigurinhaTag(leadId)
      }
    }
  }

  if (!started) await fallback()
}
