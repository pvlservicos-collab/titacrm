/**
 * Mensagem personalizada da Agenda — escolhida pela agenda que a pessoa montou.
 *
 * O funil da Agenda espera 30 minutos antes de mandar (dá tempo de o resto do
 * quiz chegar) e aí olha as respostas. Das seis situações abaixo, vale a
 * PRIMEIRA que se encaixa, na ordem de prioridade (I é a mais importante).
 * Nenhuma se encaixa, ou a pessoa não respondeu o quiz → volta pra mensagem
 * padrão do bloco.
 *
 * Os números saem do quiz cru (`a1`), que é o que a Agenda manda:
 *   ws/we          início e fim do trabalho ("09:00")
 *   meetAM/PM/Eve  minutos de reunião por período
 *   vazAM/PM       minutos de procrastinação por período
 *   train, trainDays  treina? em quais dias (0 = segunda)
 *   bed/wake       dorme / acorda ("23:00")
 *   ppl, pplWkD, pplWkDays  tempo com pessoas importantes: minutos por dia, dias
 *
 * Cuidado que já existiu: quem para no meio da Agenda chega com o quiz no
 * PADRÃO do site (ver AGENDA_A1_PADRAO) — e o padrão tem exatamente 3h de
 * procrastinação. Sem checar isso, todo mundo que não respondeu receberia a
 * mensagem III comentando uma agenda que nunca preencheu.
 */
import { AGENDA_A1_PADROES, quizNaoRespondido } from '@/lib/agenda'

export type IdMensagemAgenda = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI'

const ABERTURA = 'Oi {nome}! Aqui é a Michele da equipe do Augusto Titã, tudo bem?\n\nNós estávamos analisando a agenda que você montou na nossa plataforma e '
const AJUDA = '\n\nAcredito que podemos te ajudar com isso.\n\n'

/** "HH:MM" → minutos desde 00:00, ou null. */
function minutos(hora: unknown): number | null {
  const m = typeof hora === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(hora.trim()) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Duração de um intervalo que pode virar a meia-noite (23:00 → 06:00 = 7h). */
function duracao(inicio: unknown, fim: unknown): number | null {
  const a = minutos(inicio)
  const b = minutos(fim)
  if (a === null || b === null) return null
  return b > a ? b - a : b + 1440 - a
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

/** 240 → "4h", 210 → "3h30". */
function horas(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

interface Regra {
  id: IdMensagemAgenda
  descricao: string
  encaixa: (a1: Record<string, any>) => boolean
  /** Sem a agenda (`a1`), devolve o texto pra mostrar na tela do funil. */
  texto: (a1?: Record<string, any>) => string
}

/** Em ordem de prioridade: I primeiro. */
export const REGRAS_AGENDA: Regra[] = [
  {
    id: 'I',
    descricao: 'Trabalho ≥ 12h por dia',
    encaixa: (a1) => (duracao(a1.ws, a1.we) ?? 0) >= 12 * 60,
    texto: () =>
      ABERTURA + 'notamos que você tem trabalhado mais de 12h por dia.' + AJUDA +
      'Isso é uma preferência sua pro momento atual, ou você gostaria de conseguir aumentar a eficiência da sua organização para conseguir alocar tempo para outras áreas?',
  },
  {
    id: 'II',
    descricao: 'Reuniões ≥ 3h por dia',
    encaixa: (a1) => num(a1.meetAM) + num(a1.meetPM) + num(a1.meetEve) >= 180,
    texto: () =>
      ABERTURA + 'notamos que você possui uma média alta de reuniões diárias.' + AJUDA +
      'Você tem conseguido separar tempo para suas prioridades em meio a essas reuniões?',
  },
  {
    id: 'III',
    descricao: 'Procrastinação ≥ 3h por dia',
    // 1h30 + 1h30 é o valor que o site já traz marcado — e dá exatamente 3h.
    // Medido em 22/09: 305 de 818 agendas estavam nele, gente que chegou ao
    // fim sem mexer nesse campo. Dizer "você preencheu 3h" pra quem não
    // preencheu é o tipo de erro que entrega a automação. Intacto no padrão
    // conta como "não respondeu" só aqui; os outros padrões nem chegam perto
    // dos limites.
    // Vale pra qualquer padrão que o site já usou (o de hoje, 1h + 1h30, nem
    // chega a 3h; o antigo, 1h30 + 1h30, chegava).
    encaixa: (a1) =>
      num(a1.vazAM) + num(a1.vazPM) >= 180 &&
      !AGENDA_A1_PADROES.some((p) => num(a1.vazAM) === num(p.vazAM) && num(a1.vazPM) === num(p.vazPM)),
    // O número é o que a pessoa preencheu — "4h" fixo mentiria pra quem pôs 3h.
    texto: (a1) =>
      ABERTURA + `notamos que você preencheu ${a1 ? horas(num(a1.vazAM) + num(a1.vazPM)) : '[quantas horas a pessoa preencheu]'} de procrastinação diária.` + AJUDA +
      'Como essa procrastinação acontece? Você tem mais dificuldade de começar as atividade ou você se distrai durante elas?',
  },
  {
    id: 'IV',
    descricao: 'Atividade física ≤ 2x por semana',
    encaixa: (a1) => !a1.train || (Array.isArray(a1.trainDays) ? a1.trainDays.length : 0) <= 2,
    texto: () =>
      ABERTURA + 'notamos que você apontou que não tem praticado atividade física com muita frequência.' + AJUDA +
      'Isso é uma preferência sua, ou você gostaria de construir uma rotina com algum esporte ou musculação?',
  },
  {
    id: 'V',
    descricao: 'Sono ≤ 6h por noite',
    encaixa: (a1) => {
      const sono = duracao(a1.bed, a1.wake)
      return sono !== null && sono <= 6 * 60
    },
    texto: () =>
      ABERTURA + 'notamos que você tem dormido menos de 7h por noite.' + AJUDA +
      'Isso é uma preferência sua, ou você gostaria de dormir melhor mas não tem conseguido tempo?',
  },
  {
    id: 'VI',
    descricao: 'Pessoas importantes ≤ 1h por dia (seg a sex)',
    // Média por dia útil: 3h só na segunda dá 36 min/dia na semana.
    encaixa: (a1) => {
      if (!a1.ppl) return true
      const diasUteis = Array.isArray(a1.pplWkDays) ? a1.pplWkDays.filter((d: number) => d >= 0 && d <= 4).length : 0
      return (num(a1.pplWkD) * diasUteis) / 5 <= 60
    },
    texto: () =>
      ABERTURA + 'notamos que você possui menos de 1,5h com pessoas importantes para você por dia.' + AJUDA +
      'Isso é uma preferência sua, ou você gostaria de mais tempo com elas mas não está conseguindo?',
  },
]

/**
 * A mensagem da Agenda para este lead, ou null (manda a padrão do bloco).
 *
 * null quando: não há quiz, o quiz é só o padrão do site (não respondeu), ou
 * nenhuma das seis situações se encaixa.
 */
export function escolherMensagemDaAgenda(
  atributos: Record<string, unknown> | null | undefined
): { id: IdMensagemAgenda; texto: string } | null {
  const a1 = atributos?.a1
  if (!a1 || typeof a1 !== 'object') return null
  const fase = (atributos?.phase ?? atributos?.fase ?? null) as string | null
  if (quizNaoRespondido(a1 as Record<string, any>, fase)) return null

  for (const regra of REGRAS_AGENDA) {
    if (regra.encaixa(a1 as Record<string, any>)) return { id: regra.id, texto: regra.texto(a1 as Record<string, any>) }
  }
  return null
}

/**
 * As seis mensagens pra mostrar na tela do funil, na ordem de prioridade.
 * É a mesma lista que decide o envio — a tela não tem cópia própria pra
 * divergir do que sai no WhatsApp.
 */
export const PREVIA_DAS_MENSAGENS = REGRAS_AGENDA.map((r) => ({
  id: r.id,
  condicao: r.descricao,
  texto: r.texto(),
}))
