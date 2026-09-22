/**
 * De onde o lead veio e até onde ele foi — a etiqueta quadrada dourada.
 *
 * Quatro degraus, do mais frio pro mais quente, e o dourado esquenta junto:
 *   Agenda             começou a Agenda, não terminou o formulário do fim  → cinza levemente dourado
 *   Formulário Agenda  terminou o formulário do fim da Agenda               → dourado médio
 *   Site               só o popup do site (nome, WhatsApp, @)               → dourado cheio
 *   Formulário Site    foi até o fim do formulário de aplicação do site     → dourado brilhante
 *
 * Tudo calculado na hora, a partir de `custom_attributes` — nada gravado.
 * O "terminou o formulário" é o mesmo critério que o funil usa para cancelar a
 * mensagem de quem já se cadastrou (preencheuFormularioDaAgenda em
 * funnel-engine.ts): se a etiqueta diz que terminou, o funil concorda.
 *
 * Client-safe: não importa nada do banco.
 */

export type ChaveOrigem = 'agenda' | 'formulario_agenda' | 'site' | 'formulario_site'

export interface EtiquetaOrigem {
  chave: ChaveOrigem
  rotulo: string
  /** Texto. */
  cor: string
  /** Fundo. */
  fundo: string
  /** Borda. */
  borda: string
}

/*
 * A diferença entre os degraus não fica só no tom: o fundo também enche. Numa
 * lista com dezenas de conversas, dourado médio e dourado cheio lado a lado são
 * difíceis de separar pela cor só — o preenchimento é o que o olho pega de longe.
 */
export const ETIQUETAS_ORIGEM: Record<ChaveOrigem, EtiquetaOrigem> = {
  agenda: {
    chave: 'agenda',
    rotulo: 'Agenda',
    cor: '#B3AA92',
    fundo: 'rgba(179,170,146,0.08)',
    borda: 'rgba(179,170,146,0.45)',
  },
  formulario_agenda: {
    chave: 'formulario_agenda',
    rotulo: 'Formulário Agenda',
    cor: '#C9A45C',
    fundo: 'rgba(201,164,92,0.16)',
    borda: 'rgba(201,164,92,0.6)',
  },
  site: {
    chave: 'site',
    rotulo: 'Site',
    cor: '#E0B634',
    fundo: 'rgba(224,182,52,0.24)',
    borda: 'rgba(224,182,52,0.8)',
  },
  formulario_site: {
    chave: 'formulario_site',
    rotulo: 'Formulário Site',
    // Sólido e com texto escuro: é o lead mais quente, tem que saltar.
    cor: '#1A1405',
    fundo: '#FFC700',
    borda: '#FFD84D',
  },
}

/** Campos do formulário do fim da Agenda (os mesmos do funil). */
const CAMPOS_FORM_AGENDA = ['area', 'aumento', 'investimento']

/** Campos do formulário de aplicação do site (public/formulario-aplicacao.html). */
const CAMPOS_FORM_SITE = ['area', 'aumento', 'investimento', 'objetivo_profissional', 'qualidade_vida', 'acompanhante']

function preenchido(atributos: Record<string, unknown>, campos: string[]): boolean {
  return campos.some((campo) => {
    const valor = atributos[campo]
    return typeof valor === 'string' ? valor.trim() !== '' : valor != null && valor !== false
  })
}

/**
 * A etiqueta do lead, ou null para quem não veio de nenhum dos dois (conversa
 * que começou direto no WhatsApp, indicação, grupo).
 *
 * `agenda_antigos` (a lista importada) conta como Agenda: é a mesma Agenda,
 * só que de antes do CRM.
 */
export function etiquetaDeOrigem(atributos: Record<string, unknown> | null | undefined): EtiquetaOrigem | null {
  if (!atributos) return null
  const fonte = atributos.lead_source
  if (fonte === 'agenda_ascensao' || fonte === 'agenda_antigos') {
    return ETIQUETAS_ORIGEM[preenchido(atributos, CAMPOS_FORM_AGENDA) ? 'formulario_agenda' : 'agenda']
  }
  if (fonte === 'site_evento') {
    return ETIQUETAS_ORIGEM[preenchido(atributos, CAMPOS_FORM_SITE) ? 'formulario_site' : 'site']
  }
  return null
}
