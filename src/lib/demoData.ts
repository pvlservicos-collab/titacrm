// Dados fake usados só enquanto o login está desativado (ver AuthGuard/middleware).
// Sem sessão real não existe organização de verdade, então as telas ficavam vazias
// (Pipeline, WhatsApp API, DM Instagram). Esse módulo é o que preenche isso — nada
// aqui toca o banco real. Remover junto quando o bypass de login for revertido.
import type { LeadWithOwner, Pipeline, PipelineStage, LeadActivityWithActor, OrganizationMember } from './types'
import { LEAD_SOURCES, LEAD_SOURCE_ORDER } from './leadSources'
import { DEFAULT_FUNNELS, DEFAULT_STAGES } from './defaultAtendimento'

export const DEMO_ORG_ID = 'demo-org-000000000000000000000001'
export const DEMO_MEMBER_ID = 'demo-member-00000000000000000001'
export const DEMO_PIPELINE_ID = 'demo-pipeline-0000000000000001'
export const DEMO_USER_ID = 'demo-user-00000000000000000001'

export const demoCurrentOrganization: OrganizationMember = {
  id: DEMO_MEMBER_ID,
  organization_id: DEMO_ORG_ID,
  user_id: DEMO_USER_ID,
  role_id: 'demo-role',
  status: 'active',
  created_at: new Date().toISOString(),
  profiles: { full_name: 'Você (demo)' },
}

// Um pipeline de atendimento, com os quatro estados por onde o lead passa depois
// de entrar. A coluna "Fonte:" NAO esta aqui de proposito: ela e fixa, desenhada
// pelo proprio board (src/components/Pipeline/SourceRail.tsx), e nao uma etapa.
// Mesma divisao do seed de producao (scripts/seed-atendimento.mjs).
const DEMO_PIPELINE_ATENDIMENTO_ID = 'demo-pipeline-atendimento-00001'

const DEMO_STAGE_IA = 'demo-stage-contactado-ia-000001'
const DEMO_STAGE_FOLLOWUP = 'demo-stage-follow-up-00000001'
const DEMO_STAGE_HUMANO = 'demo-stage-atend-humano-000001'
const DEMO_STAGE_COMPROU = 'demo-stage-comprou-produto-001'

export const demoPipelineAtendimento: Pipeline = {
  id: DEMO_PIPELINE_ATENDIMENTO_ID,
  organization_id: DEMO_ORG_ID,
  name: 'Atendimento',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const demoPipelines: Pipeline[] = [demoPipelineAtendimento]

export const demoStagesAtendimento: PipelineStage[] = [
  { id: DEMO_STAGE_IA, pipeline_id: DEMO_PIPELINE_ATENDIMENTO_ID, name: 'Contactado por IA', color: '#8b5cf6', rank: 0, created_at: new Date().toISOString() },
  { id: DEMO_STAGE_FOLLOWUP, pipeline_id: DEMO_PIPELINE_ATENDIMENTO_ID, name: 'Em follow up', color: '#f59e0b', rank: 1, created_at: new Date().toISOString() },
  { id: DEMO_STAGE_HUMANO, pipeline_id: DEMO_PIPELINE_ATENDIMENTO_ID, name: 'Atendimento por humano', color: '#3987e5', rank: 2, created_at: new Date().toISOString() },
  { id: DEMO_STAGE_COMPROU, pipeline_id: DEMO_PIPELINE_ATENDIMENTO_ID, name: 'Comprou produto', color: '#199e70', rank: 3, created_at: new Date().toISOString() },
]

export const demoStagesByPipeline: Record<string, PipelineStage[]> = {
  [DEMO_PIPELINE_ATENDIMENTO_ID]: demoStagesAtendimento,
}

export const demoAllStages: PipelineStage[] = [...demoStagesAtendimento]

const WHATSAPP_INTEGRATION = { id: 'demo-integration-whatsapp', organization_id: DEMO_ORG_ID, name: 'WhatsApp API', type: 'whatsapp_cloud_official', status: 'active' as const, created_at: new Date().toISOString() }
const INSTAGRAM_INTEGRATION = { id: 'demo-integration-instagram', organization_id: DEMO_ORG_ID, name: 'Instagram Direct', type: 'instagram_direct', status: 'active' as const, created_at: new Date().toISOString() }

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString()
}

interface DemoLeadSeed {
  id: string
  title: string
  channel: 'whatsapp' | 'instagram'
  stageId: string
  lastMessage: string
  senderType: 'lead' | 'human' | 'ai'
  hoursAgoActivity: number
  value?: number
  phone?: string
  /** Fonte de origem — e o que a coluna "Fonte:" do Kanban agrupa. */
  source?: 'agenda_ascensao' | 'site_evento'
  /** Produto do pedido. So vira etiqueta no card se `pago` for true. */
  produto?: string
  /** Pedido pago. Marina tem pedido montado mas ainda nao pagou. */
  pago?: boolean
}

const seeds: DemoLeadSeed[] = [
  // Espalhados pelos quatro estados do pipeline de atendimento, e cada um com a
  // fonte de origem preenchida — e o que a coluna "Fonte:" agrupa.
  { id: 'demo-lead-01', title: 'Marina Alves', channel: 'whatsapp', stageId: DEMO_STAGE_HUMANO, lastMessage: 'Fechado, pode me mandar o link de pagamento?', senderType: 'lead', hoursAgoActivity: 0.3, value: 349.9, phone: '5511987650001', source: 'agenda_ascensao', produto: 'Agenda em Ascensão' },  // pedido montado, ainda nao pago
  { id: 'demo-lead-02', title: 'Rafael Costa', channel: 'instagram', stageId: DEMO_STAGE_IA, lastMessage: 'Vocês entregam pra Zona Leste?', senderType: 'lead', hoursAgoActivity: 1.2, phone: '5511987650002', source: 'site_evento' },
  { id: 'demo-lead-03', title: 'Beatriz Nunes', channel: 'whatsapp', stageId: DEMO_STAGE_IA, lastMessage: 'Oi! Vi o anúncio de vocês, quero saber mais', senderType: 'lead', hoursAgoActivity: 2.5, phone: '5511987650003', source: 'agenda_ascensao' },
  { id: 'demo-lead-04', title: 'João Pedro Lima', channel: 'instagram', stageId: DEMO_STAGE_COMPROU, lastMessage: 'Perfeito, obrigado pela atenção!', senderType: 'lead', hoursAgoActivity: 4, value: 189.0, phone: '5511987650004', source: 'site_evento', produto: 'Evento Presencial', pago: true },
  { id: 'demo-lead-05', title: 'Camila Duarte', channel: 'whatsapp', stageId: DEMO_STAGE_FOLLOWUP, lastMessage: 'Consegue parcelar em 3x?', senderType: 'lead', hoursAgoActivity: 5.5, phone: '5511987650005', source: 'agenda_ascensao' },
  // Janela quase fechando (< 6h restantes) — mostra a barra laranja e cai no filtro "Urgentes"
  { id: 'demo-lead-06', title: 'Studio Ipê (grupo)', channel: 'whatsapp', stageId: DEMO_STAGE_FOLLOWUP, lastMessage: 'Deixa eu confirmar com a equipe', senderType: 'human', hoursAgoActivity: 19, phone: '5511987650006', source: 'site_evento' },
  // Janela no vermelho (< 1h restante)
  { id: 'demo-lead-07', title: 'Larissa Prado', channel: 'instagram', stageId: DEMO_STAGE_HUMANO, lastMessage: 'Amei, quero fechar!', senderType: 'lead', hoursAgoActivity: 23.5, value: 259.9, phone: '5511987650007', source: 'agenda_ascensao' },
  // Janela já encerrada (> 24h)
  { id: 'demo-lead-08', title: 'Fernando Souza', channel: 'whatsapp', stageId: DEMO_STAGE_COMPROU, lastMessage: 'Recebi certinho, muito obrigado', senderType: 'lead', hoursAgoActivity: 26, value: 420.0, phone: '5511987650008', source: 'site_evento', produto: 'Mentoria Ascensão', pago: true },
  { id: 'demo-lead-09', title: 'Patrícia Gomes', channel: 'whatsapp', stageId: DEMO_STAGE_IA, lastMessage: 'Recebi sim, obrigada!', senderType: 'lead', hoursAgoActivity: 7, phone: '5511987650009', source: 'agenda_ascensao' },
  { id: 'demo-lead-10', title: 'Diego Ramos', channel: 'whatsapp', stageId: DEMO_STAGE_FOLLOWUP, lastMessage: '', senderType: 'ai', hoursAgoActivity: 12, phone: '5511987650010', source: 'site_evento' },
]

export const demoLeads: LeadWithOwner[] = seeds.map((s) => ({
  id: s.id,
  organization_id: DEMO_ORG_ID,
  stage_id: s.stageId,
  integration_id: s.channel === 'instagram' ? INSTAGRAM_INTEGRATION.id : WHATSAPP_INTEGRATION.id,
  title: s.title,
  phone: s.phone,
  value: s.value,
  ai_interest_level: 'quente',
  owner_member_id: DEMO_MEMBER_ID,
  last_activity_at: hoursAgo(s.hoursAgoActivity),
  last_activity_type: 'whatsapp',
  last_message_content: s.lastMessage,
  last_message_sender_type: s.senderType,
  is_unread: s.senderType === 'lead' && s.hoursAgoActivity < 3,
  is_pinned: false,
  is_archived: false,
  is_group: s.title.includes('(grupo)'),
  created_at: hoursAgo(s.hoursAgoActivity + 48),
  updated_at: hoursAgo(s.hoursAgoActivity),
  owner: { id: DEMO_MEMBER_ID, profiles: { full_name: 'Você (demo)' } },
  integration: s.channel === 'instagram' ? INSTAGRAM_INTEGRATION : WHATSAPP_INTEGRATION,
  lead_tags: [],
  custom_attributes: {
    ...(s.source ? { lead_source: s.source } : {}),
    // Mesmos campos que syncLeadLastOrderAttributes grava em produção. A
    // etiqueta do card depende dos dois: produto E pagamento em 'paid'.
    ...(s.produto
      ? {
          last_order_products: [s.produto],
          last_order_payment_status: s.pago ? 'paid' : 'pending',
        }
      : {}),
  },
}))

function buildThread(leadId: string, lines: Array<{ from: 'lead' | 'human'; text: string; hoursAgo: number }>): LeadActivityWithActor[] {
  return lines.map((l, i) => ({
    id: `${leadId}-msg-${i}`,
    organization_id: DEMO_ORG_ID,
    lead_id: leadId,
    actor_member_id: l.from === 'human' ? DEMO_MEMBER_ID : null,
    type: 'whatsapp',
    content: l.text,
    metadata: {
      direction: l.from === 'human' ? 'outbound' : 'inbound',
      source: l.from === 'human' ? 'human' : undefined,
      status: 'read',
    },
    created_at: hoursAgo(l.hoursAgo),
    actor: l.from === 'human' ? { profiles: { full_name: 'Você (demo)' } } : undefined,
  }))
}

// ── Funil de Mensagens (follow-up com temporizador) ─────────────────────────
interface DemoFunnelBlock {
  id: string
  type: 'trigger' | 'message' | 'wait' | 'condition' | 'move_stage' | 'end'
  positionX: number
  positionY: number
  config: Record<string, any>
}

interface DemoFunnelConnection {
  id: string
  sourceBlockId: string
  targetBlockId: string
  branch: 'default' | 'yes' | 'no'
}

interface DemoFunnel {
  id: string
  name: string
  // string pelo mesmo motivo do FunnelSummary da tela de funis: o enum
  // funnel_trigger no banco tem mais valores do que uma união fechada aqui
  // acompanharia, e agora inclui os gatilhos das fontes de lead.
  trigger: string
  is_active: boolean
  created_at: string
  blocks: DemoFunnelBlock[]
  connections: DemoFunnelConnection[]
}


// Os funis demo sao os mesmos dois de DEFAULT_FUNNELS (src/lib/defaultAtendimento.ts),
// so que com ids fake e ja ligados — assim a tela de funis mostra exatamente o
// fluxo que o setup de producao cria, sem uma segunda copia do desenho aqui.
const DEMO_STAGE_ID_BY_KEY: Record<string, string> = {
  contactado_ia: DEMO_STAGE_IA,
  follow_up: DEMO_STAGE_FOLLOWUP,
  atendimento_humano: DEMO_STAGE_HUMANO,
  comprou: DEMO_STAGE_COMPROU,
}

const demoFunnelsFromDefaults: DemoFunnel[] = DEFAULT_FUNNELS.map((funnel, index) => {
  const funnelId = `demo-funnel-${funnel.source}`
  const blockId = (key: string) => `${funnelId}-${key}`

  return {
    id: funnelId,
    name: funnel.name,
    trigger: funnel.trigger,
    is_active: true,
    created_at: hoursAgo(72 + index * 24),
    blocks: funnel.blocks.map((block) => {
      const config: Record<string, any> = { ...(block.config ?? {}) }
      if (block.stage) {
        config.stageId = DEMO_STAGE_ID_BY_KEY[block.stage]
        config.stageName = DEFAULT_STAGES.find((stage) => stage.key === block.stage)?.name ?? ''
      }
      if (block.type === 'trigger') config.trigger = funnel.trigger
      return {
        id: blockId(block.key),
        type: block.type,
        positionX: block.x,
        positionY: block.y,
        config,
      }
    }),
    connections: funnel.connections.map((conn, i) => ({
      id: `${funnelId}-conn-${i}`,
      sourceBlockId: blockId(conn.from),
      targetBlockId: blockId(conn.to),
      branch: conn.branch,
    })),
  }
})

export const demoFunnels: DemoFunnel[] = demoFunnelsFromDefaults

export const demoFunnelSummaries = [
  { id: demoFunnelsFromDefaults[0].id, name: demoFunnelsFromDefaults[0].name, trigger: demoFunnelsFromDefaults[0].trigger, is_active: true, created_at: demoFunnelsFromDefaults[0].created_at, metrics: { entradas: 62, mensagens_enviadas: 98, cliques: 14, cliques_total: 62, taxa_clique: 0.23 } },
  { id: demoFunnelsFromDefaults[1].id, name: demoFunnelsFromDefaults[1].name, trigger: demoFunnelsFromDefaults[1].trigger, is_active: true, created_at: demoFunnelsFromDefaults[1].created_at, metrics: { entradas: 41, mensagens_enviadas: 73, cliques: 11, cliques_total: 41, taxa_clique: 0.27 } },
]

export const demoActivitiesByLeadId: Record<string, LeadActivityWithActor[]> = {
  'demo-lead-01': buildThread('demo-lead-01', [
    { from: 'lead', text: 'Oi, vi o produto no Instagram e amei!', hoursAgo: 3 },
    { from: 'human', text: 'Oi Marina! Que bom :) Posso te mandar mais detalhes e o valor?', hoursAgo: 2.8 },
    { from: 'lead', text: 'Pode sim, por favor', hoursAgo: 2.7 },
    { from: 'human', text: 'Sai por R$ 349,90 com frete grátis pra sua região', hoursAgo: 2.5 },
    { from: 'lead', text: 'Fechado, pode me mandar o link de pagamento?', hoursAgo: 0.3 },
  ]),
  'demo-lead-02': buildThread('demo-lead-02', [
    { from: 'lead', text: 'Boa tarde! Vocês entregam pra Zona Leste?', hoursAgo: 1.2 },
  ]),
  'demo-lead-03': buildThread('demo-lead-03', [
    { from: 'lead', text: 'Oi! Vi o anúncio de vocês, quero saber mais', hoursAgo: 2.5 },
  ]),
  'demo-lead-04': buildThread('demo-lead-04', [
    { from: 'lead', text: 'Chegou tudo certinho, adorei!', hoursAgo: 4.2 },
    { from: 'human', text: 'Que ótimo João! Qualquer coisa é só chamar 🙂', hoursAgo: 4.1 },
    { from: 'lead', text: 'Perfeito, obrigado pela atenção!', hoursAgo: 4 },
  ]),
  'demo-lead-05': buildThread('demo-lead-05', [
    { from: 'lead', text: 'Consegue parcelar em 3x?', hoursAgo: 5.5 },
  ]),
  'demo-lead-06': buildThread('demo-lead-06', [
    { from: 'lead', text: 'Pessoal, temos interesse em levar um grupo pro evento', hoursAgo: 20 },
    { from: 'human', text: 'Deixa eu confirmar com a equipe', hoursAgo: 19 },
  ]),
  'demo-lead-07': buildThread('demo-lead-07', [
    { from: 'human', text: 'Aqui está a proposta que conversamos, Larissa!', hoursAgo: 24 },
    { from: 'lead', text: 'Amei, quero fechar!', hoursAgo: 23.5 },
  ]),
  'demo-lead-08': buildThread('demo-lead-08', [
    { from: 'lead', text: 'Recebi certinho, muito obrigado', hoursAgo: 26 },
  ]),
}

// ── Fontes de lead (tela /leads) ─────────────────────────────────────────────
// Mesma razão do resto deste arquivo: sem sessão real a tela ficaria vazia. As
// definições de coluna vêm de leadSources.ts (as de verdade), só as linhas são
// fake. Remover junto com o bypass de login.
const demoAgendaRows = [
  {
    id: 'demo-sub-agenda-1', external_id: '1041', name: 'Mariana Duarte',
    email: null, phone: '5511987654321', instagram: '@mariduarte',
    payload: {
      area: 'Empresário', aumento: 'R$25.000-R$50.000/mês', investimento: 'R$5.000 à R$15.000',
      criado_em: hoursAgo(3), phase: 'done', uid: 92, blocos: 5,
      a1: {
        bed: '23:30', wake: '06:00', ws: '09:00', we: '18:30', wdays: [0, 1, 2, 3, 4],
        commute: 30, meetAM: 60, meetPM: 120, meetEve: 0,
        bfT: '06:45', bfD: 30, lunchT: '12:30', lunchD: 60, dinT: '20:00', dinD: 45,
        train: true, trainDays: [0, 2, 4], trainT: '07:00', trainD: 60, trainCom: 15,
        ppl: true, pplWkDays: [3], pplWkT: '21:00', pplWkD: 60,
        pplWeDays: [5, 6], pplWeT: '15:00', pplWeD: 180,
        vazAM: 20, vazAMp: 'começo', vazPM: 60, vazPMp: 'fim',
      },
      real: [
        { id: 1, t: 'Dormir', s: 0, d: 360, c: 'sono', day: 0 },
        { id: 2, t: 'Treino', s: 420, d: 60, c: 'f3', day: 0 },
        { id: 3, t: 'Deslocamento', s: 495, d: 30, c: 'desvio', day: 0 },
        { id: 4, t: 'Expediente', s: 540, d: 570, c: 'f1', day: 0 },
        { id: 5, t: 'Jantar em família', s: 1200, d: 45, c: 'f3', day: 0 },
      ],
    },
    lead_id: null, received_at: hoursAgo(3), updated_at: hoursAgo(3),
  },
  {
    id: 'demo-sub-agenda-2', external_id: '1040', name: 'Rafael Nogueira',
    email: null, phone: '5521998877665', instagram: '@rafanogueira',
    payload: {
      area: 'Profissional Autônomo', aumento: 'R$10.000-R$25.000/mês', investimento: 'Até R$4.000',
      criado_em: hoursAgo(9), phase: 'w1', uid: 12, blocos: 0, a1: null, real: [],
    },
    lead_id: null, received_at: hoursAgo(9), updated_at: hoursAgo(9),
  },
  {
    id: 'demo-sub-agenda-3', external_id: '1039', name: 'Carla Mendes',
    email: null, phone: '5531991234567', instagram: '@carlamendes.co',
    payload: {
      area: 'CLT', aumento: 'R$1.000-R$10.000/mês', investimento: 'Não fiz esse tipo de investimento',
      criado_em: hoursAgo(26), phase: 'done', uid: 61, blocos: 3,
      a1: {
        bed: '00:00', wake: '07:00', ws: '08:00', we: '17:00', wdays: [0, 1, 2, 3, 4],
        commute: 0, meetAM: 30, meetPM: 30, meetEve: 0,
        bfT: '07:15', bfD: 20, lunchT: '12:00', lunchD: 45, dinT: '19:30', dinD: 40,
        train: false, trainDays: [], trainT: null, trainD: 0, trainCom: 0,
        ppl: false, pplWkDays: [], pplWkT: null, pplWkD: 0,
        pplWeDays: [], pplWeT: null, pplWeD: 0,
        vazAM: 45, vazAMp: 'fim', vazPM: 90, vazPMp: 'fim',
      },
      real: [
        { id: 1, t: 'Dormir', s: 0, d: 420, c: 'sono', day: 1 },
        { id: 2, t: 'Expediente', s: 480, d: 540, c: 'f1', day: 1 },
        { id: 3, t: 'Redes sociais', s: 1080, d: 90, c: 'vaz', day: 1 },
      ],
    },
    lead_id: null, received_at: hoursAgo(26), updated_at: hoursAgo(26),
  },
]

const demoSiteRows = [
  {
    id: 'demo-sub-site-1', external_id: '5511970001122', name: 'João Pereira',
    email: 'joao.pereira@exemplo.com', phone: '5511970001122', instagram: null,
    payload: {}, lead_id: null, received_at: hoursAgo(1), updated_at: hoursAgo(1),
  },
  {
    id: 'demo-sub-site-2', external_id: '5541988776655', name: 'Beatriz Lima',
    email: 'bia.lima@exemplo.com', phone: '5541988776655', instagram: null,
    payload: {}, lead_id: null, received_at: hoursAgo(5), updated_at: hoursAgo(5),
  },
]

export const demoSubmissionsBySource: Record<string, any[]> = {
  agenda_ascensao: demoAgendaRows,
  site_evento: demoSiteRows,
}

export const demoLeadSources = LEAD_SOURCE_ORDER.map((key) => {
  const def = LEAD_SOURCES[key]
  const rows = demoSubmissionsBySource[key] ?? []
  return {
    key: def.key,
    label: def.label,
    description: def.description,
    columns: def.columns,
    required: def.required,
    total: rows.length,
    last_received_at: rows[0]?.received_at ?? null,
  }
})

// Produtos disponíveis — listados na coluna "Comprou produto" do Kanban.
export const demoProducts = [
  { id: 'demo-produto-1', name: 'Mentoria Ascensão', price: '4970.00', status: 'active' },
  { id: 'demo-produto-2', name: 'Evento Presencial', price: '1497.00', status: 'active' },
  { id: 'demo-produto-3', name: 'Agenda em Ascensão', price: '297.00', status: 'active' },
]
