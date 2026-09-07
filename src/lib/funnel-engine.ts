import { db } from '@/lib/db'
import {
  leads, leadActivities, messageFunnels, funnelBlocks, funnelConnections,
  funnelExecutions, funnelClickEvents, funnelResponseEvents, leadStageHistory,
} from '@/lib/schema'
import { eq, and, lte } from 'drizzle-orm'
import { publishEvent, channels, events } from '@/lib/realtime'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { randomBytes } from 'crypto'

const MAX_STEPS_PER_RUN = 25

/**
 * Base das URLs rastreaveis ({link} nas mensagens do funil).
 *
 * A ordem importa: VERCEL_PROJECT_PRODUCTION_URL e o dominio estavel do projeto,
 * VERCEL_URL e o do deploy especifico (muda a cada push, serve pra preview).
 * NEXT_PUBLIC_APP_URL cobre quem roda fora da Vercel (a VPS, por exemplo).
 *
 * O ultimo fallback e o dominio deste projeto — antes apontava pro
 * 'whatsappfm.vercel.app', do projeto de onde este codigo foi copiado, o que
 * mandaria o cliente pra um link de outra aplicacao se as env faltassem.
 */
function getBaseUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')
  return 'https://titacrm.vercel.app'
}

function waitMs(value: number, unit: string) {
  const factor: Record<string, number> = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  }
  return value * (factor[unit] || factor.minutes)
}

async function getNextBlock(funnelId: string, sourceBlockId: string, branch: 'default' | 'yes' | 'no') {
  const [conn] = await db.select({ targetBlockId: funnelConnections.targetBlockId })
    .from(funnelConnections)
    .where(and(
      eq(funnelConnections.funnelId, funnelId),
      eq(funnelConnections.sourceBlockId, sourceBlockId),
      eq(funnelConnections.branch, branch),
    ))
    .limit(1)

  if (!conn) return null

  const [block] = await db.select().from(funnelBlocks).where(eq(funnelBlocks.id, conn.targetBlockId)).limit(1)
  return block || null
}

async function renderMessage(text: string, opts: { leadTitle: string; executionId: string; blockId: string; trackableUrl?: string; context?: Record<string, any> }) {
  let rendered = text.replace(/\{nome\}/gi, opts.leadTitle || '')

  if (rendered.includes('{link}') && opts.trackableUrl) {
    const token = randomBytes(8).toString('hex')
    await db.insert(funnelClickEvents).values({
      executionId: opts.executionId,
      blockId: opts.blockId,
      token,
      targetUrl: opts.trackableUrl,
    })
    rendered = rendered.replace(/\{link\}/gi, `${getBaseUrl()}/f/${token}`)
  }

  return rendered
}

async function sendMessageBlock(execution: { id: string; funnelId: string; organizationId: string; leadId: string; context?: any }, block: { id: string; config: any }) {
  const [lead] = await db.select({ id: leads.id, title: leads.title, phone: leads.phone })
    .from(leads).where(eq(leads.id, execution.leadId)).limit(1)
  if (!lead) return

  const config = block.config as { text?: string; trackableUrl?: string }
  const content = await renderMessage(config?.text || '', {
    leadTitle: lead.title,
    executionId: execution.id,
    blockId: block.id,
    trackableUrl: config?.trackableUrl,
    context: execution.context,
  })

  const metadata: Record<string, any> = {
    source: 'funnel',
    direction: 'outbound',
    automated: true,
    funnel_id: execution.funnelId,
    execution_id: execution.id,
    block_id: block.id,
  }

  if (!lead.phone) {
    metadata.send_status = 'failed'
    metadata.send_error = 'Lead sem telefone cadastrado.'
  } else {
    try {
      const result = await sendWhatsAppMessage(execution.organizationId, lead.phone, content)
      metadata.whatsapp_message_id = result?.messages?.[0]?.id
      metadata.send_status = 'sent'
    } catch (err: any) {
      metadata.send_status = 'failed'
      metadata.send_error = err.message || 'Erro ao enviar mensagem.'
    }
  }

  const [activity] = await db.insert(leadActivities).values({
    organizationId: execution.organizationId,
    leadId: lead.id,
    type: 'whatsapp',
    content,
    metadata,
  }).returning({ id: leadActivities.id })

  await db.update(leads).set({
    lastMessageContent: content,
    lastMessageSenderType: 'automated',
    lastActivityAt: new Date(),
    isUnread: true,
  }).where(eq(leads.id, lead.id))

  await publishEvent(channels.leadActivities(lead.id), events.ACTIVITY_CREATED, { id: activity.id })
  await publishEvent(channels.orgLeads(execution.organizationId), events.LEAD_UPDATED, { id: lead.id })
}

/**
 * Bloco "Mover de etapa" — leva o lead para outra coluna do Kanban.
 *
 * É o que fecha o fluxo pedido: assim que o lead responde, o ramo "Sim" da
 * condição cai aqui e ele sai de "Contactado por IA" para "Atendimento por
 * humano" sozinho, sem ninguém arrastar card.
 *
 * Registra em lead_stage_history igual a uma movimentação manual, pra a linha do
 * tempo do lead não ter buraco quando quem moveu foi o funil.
 */
async function moveStageBlock(
  execution: { organizationId: string; leadId: string },
  block: { config: any }
) {
  const stageId = (block.config as { stageId?: string })?.stageId
  if (!stageId) return

  const [lead] = await db.select({ stageId: leads.stageId })
    .from(leads).where(eq(leads.id, execution.leadId)).limit(1)
  if (!lead) return
  if (lead.stageId === stageId) return // já está lá — não polui o histórico

  await db.update(leads)
    .set({ stageId, updatedAt: new Date() })
    .where(eq(leads.id, execution.leadId))

  await db.insert(leadStageHistory).values({
    organizationId: execution.organizationId,
    leadId: execution.leadId,
    fromStageId: lead.stageId,
    toStageId: stageId,
  })

  await publishEvent(channels.orgLeads(execution.organizationId), events.LEAD_UPDATED, { id: execution.leadId })
}

/**
 * Avança a execução do funil a partir do bloco atual, processando blocos em sequência
 * até encontrar um bloco que precise aguardar (espera, condição) ou finalizar (fim).
 */
export async function advanceExecution(executionId: string) {
  for (let step = 0; step < MAX_STEPS_PER_RUN; step++) {
    const [execution] = await db.select().from(funnelExecutions).where(eq(funnelExecutions.id, executionId)).limit(1)
    if (!execution || !execution.currentBlockId) return

    const [block] = await db.select().from(funnelBlocks).where(eq(funnelBlocks.id, execution.currentBlockId)).limit(1)
    if (!block) {
      await db.update(funnelExecutions).set({ status: 'stopped', updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
      return
    }

    if (block.type === 'trigger') {
      const next = await getNextBlock(execution.funnelId, block.id, 'default')
      if (!next) {
        await db.update(funnelExecutions).set({ status: 'completed', updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
        return
      }
      await db.update(funnelExecutions).set({ currentBlockId: next.id, updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
      continue
    }

    if (block.type === 'message') {
      await sendMessageBlock(execution as any, block as any)
      await db.update(funnelExecutions).set({
        context: { ...(execution.context as object), lastMessageAt: new Date().toISOString() },
        updatedAt: new Date(),
      }).where(eq(funnelExecutions.id, executionId))

      const next = await getNextBlock(execution.funnelId, block.id, 'default')
      if (!next) {
        await db.update(funnelExecutions).set({ status: 'completed', updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
        return
      }
      await db.update(funnelExecutions).set({ currentBlockId: next.id, updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
      continue
    }

    if (block.type === 'wait') {
      const config = block.config as { value?: number; unit?: string }
      const waitUntil = new Date(Date.now() + waitMs(config?.value || 0, config?.unit || 'minutes'))
      await db.update(funnelExecutions).set({ status: 'waiting', waitUntil, updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
      return
    }

    if (block.type === 'condition') {
      const config = block.config as { value?: number; unit?: string }
      const waitUntil = new Date(Date.now() + waitMs(config?.value || 0, config?.unit || 'minutes'))
      await db.update(funnelExecutions).set({ status: 'waiting_condition', waitUntil, updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
      return
    }

    if (block.type === 'move_stage') {
      await moveStageBlock(execution as any, block as any)
      const next = await getNextBlock(execution.funnelId, block.id, 'default')
      if (!next) {
        await db.update(funnelExecutions).set({ status: 'completed', updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
        return
      }
      await db.update(funnelExecutions).set({ currentBlockId: next.id, updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
      continue
    }

    if (block.type === 'end') {
      await db.update(funnelExecutions).set({ status: 'completed', currentBlockId: null, updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
      return
    }

    // Tipo desconhecido: encerra para evitar loop
    await db.update(funnelExecutions).set({ status: 'stopped', updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
    return
  }

  // Excedeu o limite de passos (possível ciclo na configuração do funil)
  await db.update(funnelExecutions).set({ status: 'stopped', updatedAt: new Date() }).where(eq(funnelExecutions.id, executionId))
}

/**
 * Inicia uma nova execução de funil para um lead, a partir do bloco "trigger".
 */
export async function startExecution(funnelId: string, organizationId: string, leadId: string, context: Record<string, any> = {}, triggerBlockId?: string) {
  let triggerBlock: { id: string } | undefined = triggerBlockId ? { id: triggerBlockId } : undefined

  if (!triggerBlock) {
    const [found] = await db.select({ id: funnelBlocks.id }).from(funnelBlocks)
      .where(and(eq(funnelBlocks.funnelId, funnelId), eq(funnelBlocks.type, 'trigger')))
      .limit(1)
    triggerBlock = found
  }
  if (!triggerBlock) return null

  const [execution] = await db.insert(funnelExecutions).values({
    funnelId,
    organizationId,
    leadId,
    currentBlockId: triggerBlock.id,
    status: 'running',
    context,
  }).returning({ id: funnelExecutions.id })

  await advanceExecution(execution.id)
  return execution.id
}

/**
 * Processa todas as execuções pendentes: esperas vencidas e checagens de "Respondeu?".
 * Deve ser chamado periodicamente (ex: Schedule Trigger do n8n a cada poucos minutos).
 */
export async function processTick() {
  const now = new Date()
  let processed = 0

  // Esperas simples vencidas → segue para o próximo bloco
  const dueWaits = await db.select().from(funnelExecutions)
    .where(and(eq(funnelExecutions.status, 'waiting'), lte(funnelExecutions.waitUntil, now)))

  for (const execution of dueWaits) {
    if (!execution.currentBlockId) continue
    const next = await getNextBlock(execution.funnelId, execution.currentBlockId, 'default')
    if (!next) {
      await db.update(funnelExecutions).set({ status: 'completed', updatedAt: new Date() }).where(eq(funnelExecutions.id, execution.id))
      continue
    }
    await db.update(funnelExecutions).set({ currentBlockId: next.id, status: 'running', updatedAt: new Date() }).where(eq(funnelExecutions.id, execution.id))
    await advanceExecution(execution.id)
    processed++
  }

  // Condições "Respondeu?" → checa se o lead respondeu desde a última mensagem
  const pendingConditions = await db.select().from(funnelExecutions)
    .where(eq(funnelExecutions.status, 'waiting_condition'))

  for (const execution of pendingConditions) {
    if (!execution.currentBlockId) continue
    const context = (execution.context as any) || {}

    const [block] = await db.select({ config: funnelBlocks.config }).from(funnelBlocks)
      .where(eq(funnelBlocks.id, execution.currentBlockId)).limit(1)
    const conditionType = (block?.config as any)?.conditionType || 'respondeu'

    // Verifica se a condição configurada já foi satisfeita
    let responded = false
    if (conditionType === 'clique_pagina') {
      responded = !!context.viu_pagina || await hasClickedSince(execution.id)
    } else if (conditionType === 'pagamento') {
      responded = !!context.pagamento_confirmado
    } else {
      const lastMessageAt = context.lastMessageAt ? new Date(context.lastMessageAt) : execution.startedAt
      responded = await hasRespondedSince(execution.leadId, lastMessageAt as Date)
    }

    if (responded) {
      await db.insert(funnelResponseEvents).values({ executionId: execution.id, blockId: execution.currentBlockId, branch: 'yes' })
      const next = await getNextBlock(execution.funnelId, execution.currentBlockId, 'yes')
      if (!next) {
        await db.update(funnelExecutions).set({ status: 'completed', updatedAt: new Date() }).where(eq(funnelExecutions.id, execution.id))
      } else {
        await db.update(funnelExecutions).set({ currentBlockId: next.id, status: 'running', updatedAt: new Date() }).where(eq(funnelExecutions.id, execution.id))
        await advanceExecution(execution.id)
      }
      processed++
    } else if (execution.waitUntil && execution.waitUntil <= now) {
      await db.insert(funnelResponseEvents).values({ executionId: execution.id, blockId: execution.currentBlockId, branch: 'no' })
      const next = await getNextBlock(execution.funnelId, execution.currentBlockId, 'no')
      if (!next) {
        await db.update(funnelExecutions).set({ status: 'completed', updatedAt: new Date() }).where(eq(funnelExecutions.id, execution.id))
      } else {
        await db.update(funnelExecutions).set({ currentBlockId: next.id, status: 'running', updatedAt: new Date() }).where(eq(funnelExecutions.id, execution.id))
        await advanceExecution(execution.id)
      }
      processed++
    }
  }

  return { processed, checkedWaits: dueWaits.length, checkedConditions: pendingConditions.length }
}

/**
 * Resolve imediatamente uma execução parada em "waiting_condition" para o
 * ramo informado (yes/no), sem esperar o próximo tick do cron. Usado quando
 * um webhook externo já confirma a condição (ex: lead visitou a página).
 */
export async function resolveConditionNow(executionId: string, branch: 'yes' | 'no') {
  const [execution] = await db.select().from(funnelExecutions).where(eq(funnelExecutions.id, executionId)).limit(1)
  if (!execution || !execution.currentBlockId || execution.status !== 'waiting_condition') return

  await db.insert(funnelResponseEvents).values({ executionId: execution.id, blockId: execution.currentBlockId, branch })

  const next = await getNextBlock(execution.funnelId, execution.currentBlockId, branch)
  if (!next) {
    await db.update(funnelExecutions).set({ status: 'completed', updatedAt: new Date() }).where(eq(funnelExecutions.id, execution.id))
    return
  }
  await db.update(funnelExecutions).set({ currentBlockId: next.id, status: 'running', updatedAt: new Date() }).where(eq(funnelExecutions.id, execution.id))
  await advanceExecution(execution.id)
}

async function hasClickedSince(executionId: string) {
  const [row] = await db.select({ id: funnelClickEvents.id }).from(funnelClickEvents)
    .where(and(eq(funnelClickEvents.executionId, executionId), eq(funnelClickEvents.clicked, true)))
    .limit(1)
  return !!row
}

async function hasRespondedSince(leadId: string, since: Date) {
  const { sql } = await import('drizzle-orm')
  const [row] = await db.select({ id: leadActivities.id }).from(leadActivities)
    .where(and(
      eq(leadActivities.leadId, leadId),
      sql`${leadActivities.metadata}->>'direction' = 'inbound'`,
      sql`${leadActivities.createdAt} > ${since.toISOString()}`,
    ))
    .limit(1)
  return !!row
}
