/**
 * Registro das fontes de lead.
 *
 * Uma fonte = uma aba da tela /leads = um `source` aceito pela API de ingestão
 * (POST /api/ingest/leads). Este arquivo é a única coisa que precisa mudar pra
 * adicionar uma fonte nova: a tabela `lead_source_submissions` guarda o que é
 * comum em coluna e o resto em `payload` jsonb, então fonte nova não pede
 * migration.
 *
 * Cada fonte define:
 *   - `columns`  as colunas da planilha daquela aba, na ordem
 *   - `normalize` como extrair contato + campos do corpo que a fonte manda
 *   - `dedupeKey` o que identifica "o mesmo lead" quando ele é reenviado
 *
 * A ingestão é ESTRITA quanto ao `source`: um valor fora desta lista é recusado
 * com 400 listando os válidos. É de propósito — quem está configurando o envio
 * do outro lado descobre o erro de digitação na primeira requisição, em vez de
 * criar uma aba fantasma que ninguém olha.
 */

export type LeadSourceKey = 'agenda_ascensao' | 'site_evento'

/** Como a célula é renderizada na planilha. */
export type ColumnFormat =
  | 'text'
  | 'phone'
  | 'email'
  | 'instagram'
  | 'datetime'
  | 'number'
  | 'badge'

export interface LeadSourceColumn {
  /** Chave dentro da linha normalizada (ver `SubmissionRow.fields`), ou uma das
   *  colunas fixas: name, email, phone, instagram, external_id, received_at. */
  key: string
  label: string
  format?: ColumnFormat
  /** Largura mínima em px — a planilha rola na horizontal. */
  width?: number
}

/** Resultado de `normalize`: o que vai pras colunas fixas + o resto pro payload. */
export interface NormalizedLead {
  externalId: string | null
  name: string
  email: string | null
  phone: string | null
  instagram: string | null
  /** Campos específicos da fonte — vira `payload` no banco. */
  fields: Record<string, unknown>
}

export interface LeadSourceDef {
  key: LeadSourceKey
  label: string
  description: string
  /** Campos que o corpo precisa trazer; a ausência vira 400 com a lista. */
  required: string[]
  columns: LeadSourceColumn[]
  normalize: (body: Record<string, any>) => NormalizedLead
}

/* ── Helpers de normalização ──────────────────────────────────────────────── */

/** Telefone só com dígitos. A fonte pode mandar com máscara, +, espaço etc. */
export function digitsOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const digits = String(value).replace(/\D/g, '')
  return digits || null
}

function trimmed(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

/** Instagram sempre com um @ na frente, sem URL. */
function normalizeInstagram(value: unknown): string | null {
  const s = trimmed(value)
  if (!s) return null
  const handle = s
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '')
    .trim()
  return handle ? `@${handle}` : null
}

/* ── Fontes ───────────────────────────────────────────────────────────────── */

const siteEvento: LeadSourceDef = {
  key: 'site_evento',
  label: 'Site Evento',
  description: 'Formulário de captura do site do evento.',
  required: ['nome', 'whatsapp'],
  columns: [
    { key: 'name', label: 'Nome', width: 220 },
    { key: 'email', label: 'E-mail', format: 'email', width: 240 },
    { key: 'phone', label: 'WhatsApp', format: 'phone', width: 160 },
    { key: 'received_at', label: 'Recebido em', format: 'datetime', width: 170 },
  ],
  normalize: (body) => ({
    // O site não manda id próprio, então quem identifica o lead é o telefone
    // (ver dedupeKeyFor) — reenvio do mesmo formulário atualiza, não duplica.
    externalId: null,
    name: trimmed(body.nome) || 'Sem nome',
    email: trimmed(body.email),
    phone: digitsOnly(body.whatsapp),
    instagram: null,
    fields: {},
  }),
}

/** Rótulos legíveis das respostas do quiz (`agenda.a1`), na ordem de exibição. */
export const AGENDA_QUIZ_LABELS: { key: string; label: string; hint?: string }[] = [
  { key: 'bed', label: 'Vai dormir' },
  { key: 'wake', label: 'Acorda' },
  { key: 'ws', label: 'Início do expediente' },
  { key: 'we', label: 'Fim do expediente' },
  { key: 'wdays', label: 'Dias que trabalha', hint: '0=seg … 6=dom' },
  { key: 'commute', label: 'Deslocamento até o trabalho', hint: 'min por trecho (0 = trabalha em casa)' },
  { key: 'meetAM', label: 'Reunião de manhã', hint: 'minutos' },
  { key: 'meetPM', label: 'Reunião à tarde', hint: 'minutos' },
  { key: 'meetEve', label: 'Reunião à noite', hint: 'minutos' },
  { key: 'bfT', label: 'Café da manhã — horário' },
  { key: 'bfD', label: 'Café da manhã — duração' },
  { key: 'lunchT', label: 'Almoço — horário' },
  { key: 'lunchD', label: 'Almoço — duração' },
  { key: 'dinT', label: 'Jantar — horário' },
  { key: 'dinD', label: 'Jantar — duração' },
  { key: 'train', label: 'Treina atualmente' },
  { key: 'trainDays', label: 'Dias de treino' },
  { key: 'trainT', label: 'Treino — horário' },
  { key: 'trainD', label: 'Treino — duração' },
  { key: 'trainCom', label: 'Deslocamento até o treino', hint: 'min por trecho' },
  { key: 'ppl', label: 'Tem momentos fixos com pessoas importantes' },
  { key: 'pplWkDays', label: 'Pessoas (semana) — dias' },
  { key: 'pplWkT', label: 'Pessoas (semana) — horário' },
  { key: 'pplWkD', label: 'Pessoas (semana) — duração' },
  { key: 'pplWeDays', label: 'Pessoas (fim de semana) — dias' },
  { key: 'pplWeT', label: 'Pessoas (fim de semana) — horário' },
  { key: 'pplWeD', label: 'Pessoas (fim de semana) — duração' },
  { key: 'vazAM', label: 'Procrastinação de manhã', hint: 'minutos' },
  { key: 'vazAMp', label: 'Procrastinação de manhã — posição', hint: 'começo / fim' },
  { key: 'vazPM', label: 'Procrastinação à tarde', hint: 'minutos' },
  { key: 'vazPMp', label: 'Procrastinação à tarde — posição', hint: 'começo / fim' },
]

/** Categorias de bloco da agenda montada (`agenda.real[].c`). */
export const AGENDA_BLOCK_CATEGORIES: Record<string, { label: string; color: string }> = {
  f1: { label: 'Farol 1 — trabalho / progresso financeiro', color: '#f2c744' },
  f2: { label: 'Farol 2 — compromissos com pessoas', color: '#7aa2f7' },
  f3: { label: 'Farol 3 — rotina saudável', color: '#5fd39b' },
  sono: { label: 'Sono', color: '#8b7ff5' },
  desvio: { label: 'Necessário, fora dos Faróis', color: '#9a9a94' },
  vaz: { label: 'Procrastinação', color: '#e0705a' },
}

export const AGENDA_WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/** Valores fixos — a API não recusa fora da lista (o formulário pode mudar antes
 *  do CRM), mas a tela usa isto pra exibir e pra montar filtros. */
export const AGENDA_AREAS = ['Empresário', 'Profissional Autônomo', 'CLT', 'Outro']

export const AGENDA_AUMENTO = [
  'Mais de R$50.000/mês',
  'R$25.000-R$50.000/mês',
  'R$10.000-R$25.000/mês',
  'R$1.000-R$10.000/mês',
  'Menos de R$1.000/mês',
]

export const AGENDA_INVESTIMENTO = [
  'Mais de R$50.000',
  'R$31.000 à R$50.000',
  'R$16.000 à R$30.000',
  'R$5.000 à R$15.000',
  'Até R$4.000',
  'Não fiz esse tipo de investimento',
]

const agendaAscensao: LeadSourceDef = {
  key: 'agenda_ascensao',
  label: 'Agenda Ascensão',
  description: 'Quiz da Agenda Ascensão — contato, perfil profissional e agenda montada.',
  required: ['id', 'nome', 'whatsapp'],
  columns: [
    { key: 'external_id', label: 'ID', format: 'number', width: 80 },
    { key: 'name', label: 'Nome', width: 200 },
    { key: 'phone', label: 'WhatsApp', format: 'phone', width: 150 },
    { key: 'instagram', label: 'Instagram', format: 'instagram', width: 150 },
    { key: 'email', label: 'E-mail', format: 'email', width: 200 },
    { key: 'area', label: 'Área', format: 'badge', width: 170 },
    { key: 'aumento', label: 'Aumento esperado', width: 190 },
    { key: 'investimento', label: 'Já investiu', width: 190 },
    { key: 'phase', label: 'Quiz', format: 'badge', width: 110 },
    { key: 'blocos', label: 'Blocos', format: 'number', width: 80 },
    { key: 'criado_em', label: 'Criado em', format: 'datetime', width: 170 },
    { key: 'received_at', label: 'Recebido em', format: 'datetime', width: 170 },
  ],
  normalize: (body) => {
    const agenda = (body.agenda ?? {}) as Record<string, any>
    const blocks = Array.isArray(agenda.real) ? agenda.real : []

    return {
      externalId: trimmed(body.id),
      name: trimmed(body.nome) || 'Sem nome',
      // O formulário da Agenda hoje não tem campo de e-mail e manda string
      // vazia; trimmed() já converte pra null, então a coluna fica vazia em vez
      // de guardar "".
      email: trimmed(body.email),
      phone: digitsOnly(body.whatsapp),
      instagram: normalizeInstagram(body.instagram),
      fields: {
        area: trimmed(body.area),
        aumento: trimmed(body.aumento),
        investimento: trimmed(body.investimento),
        criado_em: trimmed(body.criado_em),
        // "done" = quiz completo com agenda pronta; "w1" = parou no meio.
        phase: trimmed(agenda.phase),
        uid: agenda.uid ?? null,
        blocos: blocks.length,
        // Guardados inteiros pro painel de detalhe da linha.
        a1: agenda.a1 ?? null,
        real: blocks,
      },
    }
  },
}

/* ── Registro ─────────────────────────────────────────────────────────────── */

export const LEAD_SOURCES: Record<LeadSourceKey, LeadSourceDef> = {
  agenda_ascensao: agendaAscensao,
  site_evento: siteEvento,
}

/** Ordem das abas na tela. */
export const LEAD_SOURCE_ORDER: LeadSourceKey[] = ['agenda_ascensao', 'site_evento']

export function isLeadSourceKey(value: unknown): value is LeadSourceKey {
  return typeof value === 'string' && value in LEAD_SOURCES
}

export function getLeadSource(key: string): LeadSourceDef | null {
  return isLeadSourceKey(key) ? LEAD_SOURCES[key] : null
}

/**
 * O que identifica "o mesmo lead" quando a fonte reenvia.
 *
 * Agenda manda um id numérico próprio — é a chave mais estável, e é o que
 * permite o quiz ser reenviado quando sai de "w1" pra "done" atualizando a
 * mesma linha. Site não tem id, então cai no telefone: quem preenche o
 * formulário duas vezes é a mesma pessoa, não dois leads.
 *
 * null = sem chave; toda requisição vira uma linha nova.
 */
export function dedupeKeyFor(source: LeadSourceKey, normalized: NormalizedLead): string | null {
  if (source === 'agenda_ascensao') return normalized.externalId
  if (source === 'site_evento') return normalized.phone
  return null
}
