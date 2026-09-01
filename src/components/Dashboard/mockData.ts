// Dados de demonstração — Pedro vai conectar as fontes reais depois (formulário,
// site, Instagram, indicações, pedidos e funil de mensagens). As formas abaixo
// (tipos + nomes de campo) já são as que os componentes esperam, então plugar
// dados reais no lugar é só trocar essas funções por chamadas de API.

export type AcquisitionChannel = 'form' | 'site' | 'instagram' | 'indicacoes'

export const CHANNEL_META: Record<AcquisitionChannel, { label: string; color: string }> = {
  form: { label: 'FORM', color: '#3987e5' },
  site: { label: 'Site Ascensão', color: '#d95926' },
  instagram: { label: 'Instagram', color: '#199e70' },
  indicacoes: { label: 'Indicações', color: '#c98500' },
}

export const CHANNEL_ORDER: AcquisitionChannel[] = ['form', 'site', 'instagram', 'indicacoes']

export interface ChannelTotals {
  channel: AcquisitionChannel
  newCustomers: number
}

export const mockChannelTotals: ChannelTotals[] = [
  { channel: 'form', newCustomers: 128 },
  { channel: 'site', newCustomers: 84 },
  { channel: 'instagram', newCustomers: 201 },
  { channel: 'indicacoes', newCustomers: 57 },
]

export interface DailyLeadPoint {
  date: string // yyyy-mm-dd
  form: number
  site: number
  instagram: number
  indicacoes: number
}

function buildDailyLeads(): DailyLeadPoint[] {
  const days = 14
  const points: DailyLeadPoint[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const seed = days - i
    points.push({
      date: d.toISOString().slice(0, 10),
      form: 4 + ((seed * 7) % 9),
      site: 2 + ((seed * 5) % 6),
      instagram: 6 + ((seed * 11) % 13),
      indicacoes: 1 + ((seed * 3) % 5),
    })
  }
  return points
}

export const mockDailyLeads: DailyLeadPoint[] = buildDailyLeads()

export interface PurchaseMetrics {
  salesCount: number
  productsSold: number
  totalValue: number
}

export const mockPurchaseMetrics: PurchaseMetrics = {
  salesCount: 96,
  productsSold: 214,
  totalValue: 38450.9,
}

export interface FollowUpMetrics {
  initialRepliesCount: number
  followUpsSentCount: number
  followUpRepliesCount: number
}

export const mockFollowUpMetrics: FollowUpMetrics = {
  initialRepliesCount: 342,
  followUpsSentCount: 187,
  followUpRepliesCount: 96,
}

export interface TopFollowUpMessage {
  id: string
  preview: string
  responseRate: number
  sentCount: number
}

export const mockTopFollowUpMessages: TopFollowUpMessage[] = [
  { id: '1', preview: 'Oi {{nome}}, vi que você deu uma olhada no produto e ficou com alguma dúvida?', responseRate: 68, sentCount: 54 },
  { id: '2', preview: 'Ainda temos o seu carrinho reservado — quer que eu finalize o pedido pra você?', responseRate: 61, sentCount: 41 },
  { id: '3', preview: 'Oferta especial só até hoje à noite, {{nome}} — bora garantir o seu?', responseRate: 47, sentCount: 38 },
  { id: '4', preview: 'Passando pra saber se ainda tem interesse no produto que conversamos 🙂', responseRate: 39, sentCount: 54 },
]
