/**
 * Quem está atendendo cada conversa — controle interno do time.
 *
 * A etiqueta de uma conversa é a pessoa que mandou a última mensagem manual
 * por ela, pela conta dela no CRM. Não é gravada em lugar nenhum: sai das
 * próprias mensagens toda vez que a lista carrega (GET /api/leads), então vale
 * pra conversa antiga também e nunca mexe no lead nem avisa o cliente. Mensagem
 * mandada direto do celular não tem autor — conta como atendimento humano, mas
 * não troca a etiqueta.
 *
 * Cores combinadas com o time: Augusto amarelo, Michele roxo, Cau azul. Quem
 * não está na lista ganha uma cor de reserva, na ordem.
 */

export interface Atendente {
  id: string
  nome: string
  cor: string
  /** Aparece nas abas mesmo sem conversa nenhuma (o time fixo). */
  fixo: boolean
}

// Tons claros (400) de propósito: a lista de conversas é escura, e o tom 500
// do roxo e do azul fica com pouco contraste como texto em cima dela.
const EQUIPE: { prefixo: string; nome: string; cor: string }[] = [
  { prefixo: 'augusto', nome: 'Augusto', cor: '#FACC15' }, // amarelo
  { prefixo: 'michele', nome: 'Michele', cor: '#C084FC' }, // roxo
  { prefixo: 'cau', nome: 'Cau', cor: '#60A5FA' },         // azul
]

const CORES_RESERVA = ['#4ADE80', '#F472B6', '#FB923C', '#22D3EE', '#A3E635']

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function primeiroNome(nomeCompleto: string): string {
  const primeiro = nomeCompleto.trim().split(/\s+/)[0] || ''
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1)
}

/**
 * Membros da organização → atendentes, na ordem das abas: o time fixo primeiro
 * (Augusto, Michele, Cau), depois o resto em ordem alfabética.
 *
 * O nome do perfil nem sempre é o nome de chamada ("michelensroos",
 * "Cauana"), por isso o casamento é pelo começo do nome, sem acento.
 */
export function montarAtendentes(
  membros: { id: string; profiles?: { full_name?: string | null } | null }[]
): Atendente[] {
  const fixos: Atendente[] = []
  const outros: Atendente[] = []

  for (const m of membros) {
    const nomePerfil = m.profiles?.full_name || ''
    const chave = semAcento(nomePerfil)
    const daEquipe = EQUIPE.find((e) => chave.startsWith(e.prefixo))
    if (daEquipe) fixos.push({ id: m.id, nome: daEquipe.nome, cor: daEquipe.cor, fixo: true })
    else if (nomePerfil) outros.push({ id: m.id, nome: primeiroNome(nomePerfil), cor: '', fixo: false })
  }

  fixos.sort((a, b) => EQUIPE.findIndex((e) => e.nome === a.nome) - EQUIPE.findIndex((e) => e.nome === b.nome))
  outros.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  outros.forEach((o, i) => { o.cor = CORES_RESERVA[i % CORES_RESERVA.length] })

  return [...fixos, ...outros]
}
