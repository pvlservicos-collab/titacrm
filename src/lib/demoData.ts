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

const DEMO_STAGE_NOVO = 'demo-stage-novo-00000000000001'
const DEMO_STAGE_CONVERSA = 'demo-stage-conversa-0000000001'
const DEMO_STAGE_PROPOSTA = 'demo-stage-proposta-0000000001'
const DEMO_STAGE_FECHADO = 'demo-stage-fechado-00000000001'

export const demoPipeline: Pipeline = {
  id: DEMO_PIPELINE_ID,
  organization_id: DEMO_ORG_ID,
  name: 'Vendas',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const demoStages: PipelineStage[] = [
  { id: DEMO_STAGE_NOVO, pipeline_id: DEMO_PIPELINE_ID, name: 'Novo contato', color: '#3987e5', rank: 0, created_at: new Date().toISOString() },
  { id: DEMO_STAGE_CONVERSA, pipeline_id: DEMO_PIPELINE_ID, name: 'Em conversa', color: '#c98500', rank: 1, created_at: new Date().toISOString() },
  { id: DEMO_STAGE_PROPOSTA, pipeline_id: DEMO_PIPELINE_ID, name: 'Proposta enviada', color: '#d95926', rank: 2, created_at: new Date().toISOString() },
  { id: DEMO_STAGE_FECHADO, pipeline_id: DEMO_PIPELINE_ID, name: 'Fechado', color: '#199e70', rank: 3, created_at: new Date().toISOString() },
]

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
  { id: 'demo-lead-01', title: 'Marina Alves', channel: 'whatsapp', stageId: DEMO_STAGE_PROPOSTA, lastMessage: 'Fechado, pode me mandar o link de pagamento?', senderType: 'lead', hoursAgoActivity: 0.3, value: 349.9, phone: '5511987650001' },
  { id: 'demo-lead-02', title: 'Rafael Costa', channel: 'instagram', stageId: DEMO_STAGE_CONVERSA, lastMessage: 'Vocês entregam pra Zona Leste?', senderType: 'lead', hoursAgoActivity: 1.2 },
  { id: 'demo-lead-03', title: 'Beatriz Nunes', channel: 'whatsapp', stageId: DEMO_STAGE_NOVO, lastMessage: 'Oi! Vi o anúncio de vocês, quero saber mais', senderType: 'lead', hoursAgoActivity: 2.5 },
  { id: 'demo-lead-04', title: 'João Pedro Lima', channel: 'instagram', stageId: DEMO_STAGE_FECHADO, lastMessage: 'Perfeito, obrigado pela atenção!', senderType: 'lead', hoursAgoActivity: 4, value: 189.0 },
  { id: 'demo-lead-05', title: 'Camila Duarte', channel: 'whatsapp', stageId: DEMO_STAGE_CONVERSA, lastMessage: 'Consegue parcelar em 3x?', senderType: 'lead', hoursAgoActivity: 5.5 },
  { id: 'demo-lead-06', title: 'Studio Ipê (grupo)', channel: 'whatsapp', stageId: DEMO_STAGE_NOVO, lastMessage: 'Deixa eu confirmar com a equipe', senderType: 'human', hoursAgoActivity: 8 },
  { id: 'demo-lead-07', title: 'Larissa Prado', channel: 'instagram', stageId: DEMO_STAGE_PROPOSTA, lastMessage: 'Amei, quero fechar!', senderType: 'lead', hoursAgoActivity: 12, value: 259.9 },
  { id: 'demo-lead-08', title: 'Fernando Souza', channel: 'whatsapp', stageId: DEMO_STAGE_FECHADO, lastMessage: 'Recebi certinho, muito obrigado', senderType: 'lead', hoursAgoActivity: 26, value: 420.0 },
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
    { from: 'lead', text: 'Pessoal, temos interesse em fechar um pacote maior', hoursAgo: 9 },
    { from: 'human', text: 'Deixa eu confirmar com a equipe', hoursAgo: 8 },
  ]),
  'demo-lead-07': buildThread('demo-lead-07', [
    { from: 'human', text: 'Aqui está a proposta que conversamos, Larissa!', hoursAgo: 13 },
    { from: 'lead', text: 'Amei, quero fechar!', hoursAgo: 12 },
  ]),
  'demo-lead-08': buildThread('demo-lead-08', [
    { from: 'lead', text: 'Recebi certinho, muito obrigado', hoursAgo: 26 },
  ]),
}
