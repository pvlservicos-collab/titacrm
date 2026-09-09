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
import { resumoAgenda, type AgendaBlock } from '@/lib/agenda'

export type LeadSourceKey = 'agenda_ascensao' | 'site_evento' | 'agenda_antigos'

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
  /**
   * Se a fonte é um canal de aquisição ao vivo. Padrão: true.
   *
   * `false` para lista importada de planilha: os leads não chegaram por aquele
   * canal naquele dia, chegaram meses atrás e entraram todos de uma vez. Isso a
   * mantém fora do dashboard (onde criaria um pico falso na série diária) e da
   * coluna "Fonte:" do Kanban (que mostra por onde o lead está entrando agora).
   * A aba dela em Configurações → Leads continua existindo normalmente.
   */
  isAcquisitionChannel?: boolean
}

/* ── Helpers de normalização ──────────────────────────────────────────────── */

/** Telefone só com dígitos. A fonte pode mandar com máscara, +, espaço etc. */
export function digitsOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const digits = String(value).replace(/\D/g, '')
  return digits || null
}

/**
 * Telefone pronto pro WhatsApp: dígitos + DDI do Brasil.
 *
 * Formulário de site e a Agenda mandam "(11) 97158-4474" — DDD + número, sem o
 * 55. A Cloud API precisa de DDI+DDD+número, então um lead gravado assim entra
 * no CRM, aparece na lista e no Kanban, mas a mensagem simplesmente não sai —
 * falha silenciosa, descoberta só quando alguém repara que o lead nunca foi
 * contactado. Por isso o DDI entra aqui, na porta de entrada, e não na hora de
 * enviar: assim o número certo é o que fica gravado, e o dedupe do site_evento
 * (que usa o telefone como chave) compara sempre o mesmo formato.
 *
 * Só acrescenta em número de 10 ou 11 dígitos que ainda não comece com 55, pra
 * não estragar um contato internacional que já venha completo. Mesma regra do
 * scripts/importar-csv-leads.mjs — os 644 da planilha já estão com o 55.
 */
export function normalizePhone(value: unknown): string | null {
  const digits = digitsOnly(value)
  if (!digits) return null
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return '55' + digits
  }
  return digits
}

function trimmed(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

/**
 * Data de cadastro no formato da planilha ("07/09/2026, 21:18").
 *
 * A coluna "Cadastro" da lista antiga é texto — foi o que a exportação do site
 * mandou. O reenvio automático manda a mesma data em ISO, então converter aqui
 * mantém a coluna com um formato só.
 *
 * Só converte o que é ISO de verdade. Qualquer outro texto passa intacto — em
 * especial o "07/09/2026" da própria planilha, que o `new Date()` do JS leria
 * como 9 de julho (mês primeiro, à americana) e gravaria a data trocada.
 */
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

function dataCadastro(value: unknown): string | null {
  const s = trimmed(value)
  if (!s) return null
  if (!ISO_RE.test(s)) return s
  const data = new Date(s)
  if (Number.isNaN(data.getTime())) return s
  return data.toLocaleString('pt-BR', {
    // Fuso fixo, não o do servidor: a Vercel roda em UTC, e sem isto o mesmo
    // cadastro apareceria 3 horas antes do que a planilha (exportada de um
    // navegador no Brasil) mostrou pra mesma pessoa.
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  // Sem campo obrigatório de propósito: é um formulário de WordPress, onde os
  // nomes dos campos mudam a cada edição e quem preenche não tem culpa da
  // configuração. Melhor gravar incompleto (e completar depois) do que recusar
  // e perder o lead. A fonte agenda_ascensao continua exigindo id/nome/whatsapp
  // porque ali quem chama é um sistema nosso, e faltar campo é bug, não acaso.
  required: [],
  columns: [
    { key: 'name', label: 'Nome', width: 220 },
    { key: 'email', label: 'E-mail', format: 'email', width: 240 },
    { key: 'phone', label: 'WhatsApp', format: 'phone', width: 160 },
    { key: 'received_at', label: 'Recebido em', format: 'datetime', width: 170 },
  ],
  normalize: (body) => {
    // Guarda o corpo inteiro como veio, tirando só o que já virou coluna. Assim
    // um campo que o formulário mandou e a gente não soube interpretar continua
    // visível no detalhe do lead, em vez de sumir.
    const extras: Record<string, unknown> = {}
    for (const [chave, valor] of Object.entries(body)) {
      if (['source', 'nome', 'email', 'whatsapp', 'instagram', 'key', 'token', 'resync'].includes(chave)) continue
      extras[chave] = valor
    }

    return {
      // O site não manda id próprio, então quem identifica o lead é o telefone
      // (ver dedupeKeyFor) — reenvio do mesmo formulário atualiza, não duplica.
      externalId: null,
      name: trimmed(body.nome) || 'Sem nome',
      email: trimmed(body.email),
      phone: normalizePhone(body.whatsapp),
      instagram: normalizeInstagram(body.instagram),
      fields: extras,
    }
  },
}

/**
 * Os rótulos do quiz, as categorias de bloco e os dias da semana moram em
 * `@/lib/agenda` — é lá que fica tudo que entende o formato da agenda montada.
 * Continuam reexportados aqui porque a tela da planilha já os importava deste
 * módulo, e porque uma fonte e o formato do dado dela andam juntos.
 */
export {
  AGENDA_QUIZ_LABELS,
  AGENDA_BLOCK_CATEGORIES,
  AGENDA_WEEKDAYS,
} from '@/lib/agenda'

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

/**
 * Colunas de resumo do quiz — as mesmas nas duas fontes da Agenda.
 *
 * São derivadas de `a1` por `resumoAgenda()`, então valem tanto pro lead que
 * chegou pelo webhook quanto pro que veio da lista antiga. Ficam numa constante
 * porque as duas abas precisam mostrar o mesmo dado no mesmo lugar — a
 * diferença entre as fontes é de onde o lead veio, não do que ele respondeu.
 */
const COLUNAS_RESUMO_AGENDA: LeadSourceColumn[] = [
  { key: 'sono', label: 'Sono', width: 130 },
  { key: 'trabalho', label: 'Trabalho', width: 240 },
  { key: 'deslocamento', label: 'Deslocamento', width: 130 },
  { key: 'reunioes', label: 'Reuniões', width: 150 },
  { key: 'cafe', label: 'Café da manhã', width: 140 },
  { key: 'almoco', label: 'Almoço', width: 140 },
  { key: 'jantar', label: 'Jantar', width: 140 },
  { key: 'treino', label: 'Treino', width: 220 },
  { key: 'pessoas', label: 'Pessoas importantes', width: 240 },
  { key: 'procrastinacao', label: 'Procrastinação', width: 170 },
]

/**
 * Extrai os campos da agenda do corpo que o site manda.
 *
 * Os campos de perfil (instagram, área, aumento, investimento) chegam no topo do
 * corpo, mas o site também os guarda dentro de `agenda` — ler os dois evita que
 * uma mudança de um lado só esvazie a coluna no CRM.
 */
function camposDaAgenda(body: Record<string, any>) {
  const agenda = (body.agenda ?? {}) as Record<string, any>
  const a1 = (agenda.a1 ?? null) as Record<string, any> | null
  const blocks = (Array.isArray(agenda.real) ? agenda.real : []) as AgendaBlock[]

  return {
    agenda,
    perfil: {
      area: trimmed(body.area) ?? trimmed(agenda.area),
      aumento: trimmed(body.aumento) ?? trimmed(agenda.aumento),
      investimento: trimmed(body.investimento) ?? trimmed(agenda.investimento),
    },
    instagram: normalizeInstagram(body.instagram ?? agenda.instagram),
    // "done" = quiz completo com agenda pronta; "w1" = parou no meio.
    phase: trimmed(agenda.phase),
    // Só entra no payload o que existe: um `a1: null` sobrescrevendo o `a1` que
    // já estava gravado apagaria a agenda de quem foi reenviado incompleto.
    quiz: a1 ? { a1, ...resumoAgenda(a1) } : {},
    blocos: blocks.length > 0 ? { real: blocks, blocos: blocks.length } : {},
  }
}

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
    ...COLUNAS_RESUMO_AGENDA,
    { key: 'criado_em', label: 'Criado em', format: 'datetime', width: 170 },
    { key: 'received_at', label: 'Recebido em', format: 'datetime', width: 170 },
  ],
  normalize: (body) => {
    const { perfil, instagram, phase, quiz, blocos, agenda } = camposDaAgenda(body)

    return {
      externalId: trimmed(body.id),
      name: trimmed(body.nome) || 'Sem nome',
      // O formulário da Agenda hoje não tem campo de e-mail e manda string
      // vazia; trimmed() já converte pra null, então a coluna fica vazia em vez
      // de guardar "".
      email: trimmed(body.email),
      phone: normalizePhone(body.whatsapp),
      instagram,
      fields: {
        ...perfil,
        criado_em: trimmed(body.criado_em),
        phase,
        uid: agenda.uid ?? null,
        // Quiz e blocos inteiros pro painel de detalhe, junto do resumo em
        // texto que alimenta as colunas da planilha.
        ...quiz,
        ...blocos,
      },
    }
  },
}

const agendaAntigos: LeadSourceDef = {
  key: 'agenda_antigos',
  label: 'Agenda — lista antiga',
  description: 'Leads da Agenda anteriores à integração automática.',
  // Lista histórica, não aquisição: fica fora do dashboard e da coluna "Fonte:"
  // do Kanban mesmo depois de o site reenviar esses leads com a agenda completa.
  isAcquisitionChannel: false,
  // Sem obrigatório: entrou por planilha (scripts/importar-csv-leads.mjs) e hoje
  // é reenviada pelo próprio site. Recusar linha aqui só faria perder lead de uma
  // lista que já é histórica.
  required: [],
  columns: [
    { key: 'external_id', label: 'ID', format: 'number', width: 80 },
    { key: 'name', label: 'Nome', width: 190 },
    { key: 'phone', label: 'WhatsApp', format: 'phone', width: 150 },
    { key: 'instagram', label: 'Instagram', format: 'instagram', width: 160 },
    { key: 'email', label: 'E-mail', format: 'email', width: 180 },
    { key: 'criado_em', label: 'Cadastro', width: 150 },
    { key: 'fase', label: 'Quiz', format: 'badge', width: 110 },
    { key: 'area', label: 'Área', width: 150 },
    { key: 'aumento', label: 'Aumento esperado', width: 170 },
    { key: 'investimento', label: 'Já investiu', width: 170 },
    { key: 'blocos', label: 'Blocos', format: 'number', width: 80 },
    ...COLUNAS_RESUMO_AGENDA,
  ],
  /**
   * Aceita os dois formatos em que essa lista chega.
   *
   * A planilha exportada do site traz tudo em texto já legível ("22:00–05:00",
   * "noite 1h") e nenhuma agenda montada — foi assim que os 644 leads
   * históricos entraram. A ressincronização manda o mesmo lead no formato cru
   * (`agenda.a1` + `agenda.real`), que é o único jeito de o CRM montar a semana
   * dele bloco a bloco.
   *
   * Com o formato cru, o resumo em texto é derivado de `a1` — dá as mesmas
   * frases da planilha, então as colunas continuam preenchidas — e os campos
   * soltos do corpo seguem sendo lidos, pro reenvio nunca apagar o que a
   * planilha havia trazido.
   */
  normalize: (body) => {
    const { perfil, instagram, phase, quiz, blocos } = camposDaAgenda(body)

    const daPlanilha = [
      'fase', 'sono', 'trabalho', 'deslocamento', 'reunioes',
      'cafe', 'almoco', 'jantar', 'treino', 'pessoas', 'procrastinacao',
    ]
    const fields: Record<string, unknown> = {}
    for (const chave of daPlanilha) {
      const valor = trimmed(body[chave])
      // "—" é como a exportação marca campo vazio; vira ausência de verdade.
      if (valor && valor !== '\u2014') fields[chave] = valor
    }
    for (const [chave, valor] of Object.entries(perfil)) {
      if (valor) fields[chave] = valor
    }
    // A planilha mandava "07/09/2026, 21:18"; o reenvio manda ISO. A coluna é
    // texto, então normaliza pro formato da planilha em vez de deixar a lista
    // com dois padrões de data misturados.
    const cadastro = trimmed(body.criado_em)
    if (cadastro) fields.criado_em = dataCadastro(cadastro)

    return {
      externalId: trimmed(body.id),
      name: trimmed(body.nome) || 'Sem nome',
      email: trimmed(body.email) === '\u2014' ? null : trimmed(body.email),
      phone: normalizePhone(body.whatsapp),
      instagram,
      fields: {
        ...fields,
        ...(phase ? { fase: phase } : {}),
        ...quiz,
        ...blocos,
      },
    }
  },
}

/* ── Registro ─────────────────────────────────────────────────────────────── */

export const LEAD_SOURCES: Record<LeadSourceKey, LeadSourceDef> = {
  agenda_ascensao: agendaAscensao,
  site_evento: siteEvento,
  agenda_antigos: agendaAntigos,
}

/** Ordem das abas na tela. */
export const LEAD_SOURCE_ORDER: LeadSourceKey[] = ['agenda_ascensao', 'site_evento', 'agenda_antigos']

/**
 * Só os canais de aquisição ao vivo. É o que o dashboard e a coluna "Fonte:" do
 * Kanban usam — os dois falam sobre por onde o lead está entrando, e uma lista
 * importada não responde a essa pergunta.
 */
export const ACQUISITION_SOURCE_ORDER: LeadSourceKey[] = LEAD_SOURCE_ORDER.filter(
  (key) => LEAD_SOURCES[key].isAcquisitionChannel !== false
)

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
  if (source === 'agenda_antigos') return normalized.externalId
  if (source === 'site_evento') return normalized.phone
  return null
}
