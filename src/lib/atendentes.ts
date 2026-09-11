/**
 * Quem está atendendo cada conversa — controle interno do time.
 *
 * A etiqueta de uma conversa é a pessoa do time que mandou a última mensagem
 * manual por ela, pela conta dela no CRM. Não é gravada em lugar nenhum: sai
 * das próprias mensagens toda vez que a lista carrega (GET /api/leads), então
 * vale pra conversa antiga também e nunca mexe no lead nem avisa o cliente.
 * Mensagem mandada direto do celular não tem autor — conta como atendimento
 * humano, mas não troca a etiqueta.
 *
 * Só o time de atendimento vira atendente. A conta de admin ("Tita") e
 * qualquer outra fora da lista não ganha aba nem etiqueta: se o admin entra
 * numa conversa da Michele, ela continua sendo da Michele. Pra incluir alguém
 * novo no atendimento, é acrescentar aqui.
 *
 * Cores combinadas com o time: Augusto amarelo, Michele roxo, Cau azul.
 */

export interface Atendente {
  id: string
  nome: string
  cor: string
}

// Tons claros (400) de propósito: a lista de conversas é escura, e o tom 500
// do roxo e do azul fica com pouco contraste como texto em cima dela.
const EQUIPE: { prefixo: string; nome: string; cor: string }[] = [
  { prefixo: 'augusto', nome: 'Augusto', cor: '#FACC15' }, // amarelo
  { prefixo: 'michele', nome: 'Michele', cor: '#C084FC' }, // roxo
  { prefixo: 'cau', nome: 'Cau', cor: '#60A5FA' },         // azul
]

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Membros da organização → atendentes, na ordem das abas (Augusto, Michele,
 * Cau). Quem não é do time fica de fora.
 *
 * O nome do perfil nem sempre é o nome de chamada ("michelensroos",
 * "Cauana"), por isso o casamento é pelo começo do nome, sem acento.
 */
export function montarAtendentes(
  membros: { id: string; profiles?: { full_name?: string | null } | null }[]
): Atendente[] {
  const atendentes: Atendente[] = []
  for (const m of membros) {
    const chave = semAcento(m.profiles?.full_name || '')
    const daEquipe = EQUIPE.find((e) => chave.startsWith(e.prefixo))
    if (daEquipe) atendentes.push({ id: m.id, nome: daEquipe.nome, cor: daEquipe.cor })
  }
  return atendentes.sort(
    (a, b) => EQUIPE.findIndex((e) => e.nome === a.nome) - EQUIPE.findIndex((e) => e.nome === b.nome)
  )
}

/**
 * O atendente da conversa: o autor mais recente que é do time. `autores` vem
 * do mais recente pro mais antigo (GET /api/leads).
 */
export function atendenteDaConversa(
  autores: string[] | undefined,
  porId: Record<string, Atendente>
): Atendente | undefined {
  for (const id of autores ?? []) if (porId[id]) return porId[id]
  return undefined
}
