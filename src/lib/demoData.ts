// Dados fake usados só enquanto o login está desativado (ver AuthGuard/middleware).
// Sem sessão real não existe organização de verdade, então as telas ficavam vazias
// (Pipeline, WhatsApp API, DM Instagram). Esse módulo é o que preenche isso — nada
// aqui toca o banco real. Remover junto quando o bypass de login for revertido.
import type { LeadWithOwner, Pipeline, PipelineStage, LeadActivityWithActor, OrganizationMember } from './types'

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

// Duas origens de lead magnet, cada uma com o próprio pipeline/etapas — os 3
// canais orgânicos (FORM, Site, Indicações) entram direto no funil de vendas,
// esses dois têm o funil próprio de quem se cadastrou no material gratuito.
const DEMO_PIPELINE_AGENDA_ID = 'demo-pipeline-agenda-00000001'
const DEMO_PIPELINE_EVENTO_ID = 'demo-pipeline-evento-00000001'

const DEMO_STAGE_CADASTRO = 'demo-stage-cadastro-0000000001'
const DEMO_STAGE_VIU_AGENDA = 'demo-stage-viu-agenda-000000001'
const DEMO_STAGE_APLICOU_SESSAO = 'demo-stage-aplicou-sessao-00001'
const DEMO_STAGE_APLICOU_EVENTO = 'demo-stage-aplicou-evento-00001'
const DEMO_STAGE_PREENCHEU_FORM = 'demo-stage-preencheu-form-00001'

export const demoPipelineAgenda: Pipeline = {
  id: DEMO_PIPELINE_AGENDA_ID,
  organization_id: DEMO_ORG_ID,
  name: 'Minha Agenda em Ascensão',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const demoPipelineEvento: Pipeline = {
  id: DEMO_PIPELINE_EVENTO_ID,
  organization_id: DEMO_ORG_ID,
  name: 'Evento Ascensão',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const demoPipelines: Pipeline[] = [demoPipelineAgenda, demoPipelineEvento]

export const demoStagesAgenda: PipelineStage[] = [
  { id: DEMO_STAGE_CADASTRO, pipeline_id: DEMO_PIPELINE_AGENDA_ID, name: 'Cadastro', color: '#3987e5', rank: 0, created_at: new Date().toISOString() },
  { id: DEMO_STAGE_VIU_AGENDA, pipeline_id: DEMO_PIPELINE_AGENDA_ID, name: 'Viu a agenda completa', color: '#c98500', rank: 1, created_at: new Date().toISOString() },
  { id: DEMO_STAGE_APLICOU_SESSAO, pipeline_id: DEMO_PIPELINE_AGENDA_ID, name: 'Aplicou para sessão', color: '#199e70', rank: 2, created_at: new Date().toISOString() },
]

export const demoStagesEvento: PipelineStage[] = [
  { id: DEMO_STAGE_APLICOU_EVENTO, pipeline_id: DEMO_PIPELINE_EVENTO_ID, name: 'Aplicou para o evento', color: '#3987e5', rank: 0, created_at: new Date().toISOString() },
  { id: DEMO_STAGE_PREENCHEU_FORM, pipeline_id: DEMO_PIPELINE_EVENTO_ID, name: 'Preencheu o form de inscrição', color: '#199e70', rank: 1, created_at: new Date().toISOString() },
]

export const demoStagesByPipeline: Record<string, PipelineStage[]> = {
  [DEMO_PIPELINE_AGENDA_ID]: demoStagesAgenda,
  [DEMO_PIPELINE_EVENTO_ID]: demoStagesEvento,
}

export const demoAllStages: PipelineStage[] = [...demoStagesAgenda, ...demoStagesEvento]

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
}

const seeds: DemoLeadSeed[] = [
  { id: 'demo-lead-01', title: 'Marina Alves', channel: 'whatsapp', stageId: DEMO_STAGE_APLICOU_SESSAO, lastMessage: 'Fechado, pode me mandar o link de pagamento?', senderType: 'lead', hoursAgoActivity: 0.3, value: 349.9, phone: '5511987650001' },
  { id: 'demo-lead-02', title: 'Rafael Costa', channel: 'instagram', stageId: DEMO_STAGE_VIU_AGENDA, lastMessage: 'Vocês entregam pra Zona Leste?', senderType: 'lead', hoursAgoActivity: 1.2 },
  { id: 'demo-lead-03', title: 'Beatriz Nunes', channel: 'whatsapp', stageId: DEMO_STAGE_CADASTRO, lastMessage: 'Oi! Vi o anúncio de vocês, quero saber mais', senderType: 'lead', hoursAgoActivity: 2.5 },
  { id: 'demo-lead-04', title: 'João Pedro Lima', channel: 'instagram', stageId: DEMO_STAGE_PREENCHEU_FORM, lastMessage: 'Perfeito, obrigado pela atenção!', senderType: 'lead', hoursAgoActivity: 4, value: 189.0 },
  { id: 'demo-lead-05', title: 'Camila Duarte', channel: 'whatsapp', stageId: DEMO_STAGE_VIU_AGENDA, lastMessage: 'Consegue parcelar em 3x?', senderType: 'lead', hoursAgoActivity: 5.5 },
  // Janela quase fechando (< 6h restantes) — mostra a barra laranja e cai no filtro "Urgentes"
  { id: 'demo-lead-06', title: 'Studio Ipê (grupo)', channel: 'whatsapp', stageId: DEMO_STAGE_APLICOU_EVENTO, lastMessage: 'Deixa eu confirmar com a equipe', senderType: 'human', hoursAgoActivity: 19 },
  // Janela no vermelho (< 1h restante)
  { id: 'demo-lead-07', title: 'Larissa Prado', channel: 'instagram', stageId: DEMO_STAGE_APLICOU_SESSAO, lastMessage: 'Amei, quero fechar!', senderType: 'lead', hoursAgoActivity: 23.5, value: 259.9 },
  // Janela já encerrada (> 24h)
  { id: 'demo-lead-08', title: 'Fernando Souza', channel: 'whatsapp', stageId: DEMO_STAGE_PREENCHEU_FORM, lastMessage: 'Recebi certinho, muito obrigado', senderType: 'lead', hoursAgoActivity: 26, value: 420.0 },
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
  type: 'trigger' | 'message' | 'wait' | 'condition' | 'end'
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
  trigger: 'novo_pago' | 'novo_recuperacao'
  is_active: boolean
  created_at: string
  blocks: DemoFunnelBlock[]
  connections: DemoFunnelConnection[]
}

function linearConnections(funnelId: string, blockIds: string[]): DemoFunnelConnection[] {
  const conns: DemoFunnelConnection[] = []
  for (let i = 0; i < blockIds.length - 1; i++) {
    conns.push({ id: `${funnelId}-conn-${i}`, sourceBlockId: blockIds[i], targetBlockId: blockIds[i + 1], branch: 'default' })
  }
  return conns
}

const RECOVERY_FUNNEL_ID = 'demo-funnel-recuperacao-000001'
const recoveryBlocks: DemoFunnelBlock[] = [
  { id: `${RECOVERY_FUNNEL_ID}-trigger`, type: 'trigger', positionX: 0, positionY: 100, config: {} },
  { id: `${RECOVERY_FUNNEL_ID}-msg1`, type: 'message', positionX: 320, positionY: 100, config: { text: 'Oi {{nome}}! Vi que você deixou uns itens no carrinho 👀 Posso te ajudar a finalizar?' } },
  { id: `${RECOVERY_FUNNEL_ID}-wait1`, type: 'wait', positionX: 640, positionY: 100, config: { value: 30, unit: 'minutes' } },
  { id: `${RECOVERY_FUNNEL_ID}-msg2`, type: 'message', positionX: 960, positionY: 100, config: { text: 'Ainda dá tempo! Separei um cupom de 10% pra você finalizar hoje 🙂' } },
  { id: `${RECOVERY_FUNNEL_ID}-wait2`, type: 'wait', positionX: 1280, positionY: 100, config: { value: 1, unit: 'days' } },
  { id: `${RECOVERY_FUNNEL_ID}-end`, type: 'end', positionX: 1600, positionY: 100, config: {} },
]

const POSVENDA_FUNNEL_ID = 'demo-funnel-posvenda-0000001'
const posvendaBlocks: DemoFunnelBlock[] = [
  { id: `${POSVENDA_FUNNEL_ID}-trigger`, type: 'trigger', positionX: 0, positionY: 100, config: {} },
  { id: `${POSVENDA_FUNNEL_ID}-msg1`, type: 'message', positionX: 320, positionY: 100, config: { text: 'Muito obrigado pela compra! Seu pedido já está sendo preparado 🎉' } },
  { id: `${POSVENDA_FUNNEL_ID}-wait1`, type: 'wait', positionX: 640, positionY: 100, config: { value: 2, unit: 'hours' } },
  { id: `${POSVENDA_FUNNEL_ID}-msg2`, type: 'message', positionX: 960, positionY: 100, config: { text: 'Como está sendo sua experiência até aqui? Qualquer coisa é só chamar 🙂' } },
  { id: `${POSVENDA_FUNNEL_ID}-wait2`, type: 'wait', positionX: 1280, positionY: 100, config: { value: 3, unit: 'days' } },
  { id: `${POSVENDA_FUNNEL_ID}-msg3`, type: 'message', positionX: 1600, positionY: 100, config: { text: 'Já deu tempo de usar? Adoraríamos saber sua opinião ⭐' } },
  { id: `${POSVENDA_FUNNEL_ID}-end`, type: 'end', positionX: 1920, positionY: 100, config: {} },
]

export const demoFunnels: DemoFunnel[] = [
  {
    id: RECOVERY_FUNNEL_ID,
    name: 'Recuperação de Carrinho',
    trigger: 'novo_recuperacao',
    is_active: true,
    created_at: hoursAgo(240),
    blocks: recoveryBlocks,
    connections: linearConnections(RECOVERY_FUNNEL_ID, recoveryBlocks.map((b) => b.id)),
  },
  {
    id: POSVENDA_FUNNEL_ID,
    name: 'Boas-vindas Pós-Venda',
    trigger: 'novo_pago',
    is_active: true,
    created_at: hoursAgo(168),
    blocks: posvendaBlocks,
    connections: linearConnections(POSVENDA_FUNNEL_ID, posvendaBlocks.map((b) => b.id)),
  },
]

export const demoFunnelSummaries = [
  { id: RECOVERY_FUNNEL_ID, name: 'Recuperação de Carrinho', trigger: 'novo_recuperacao', is_active: true, created_at: hoursAgo(240), metrics: { entradas: 84, mensagens_enviadas: 152, cliques: 21, cliques_total: 84, taxa_clique: 0.25 } },
  { id: POSVENDA_FUNNEL_ID, name: 'Boas-vindas Pós-Venda', trigger: 'novo_pago', is_active: true, created_at: hoursAgo(168), metrics: { entradas: 96, mensagens_enviadas: 268, cliques: 9, cliques_total: 96, taxa_clique: 0.09 } },
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
