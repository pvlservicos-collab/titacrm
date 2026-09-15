/**
 * Simulação da troca de conversa no chat — `node scripts/simular-selecao-chat.mjs`.
 *
 * Existe porque o mesmo bug voltou três vezes: clicar numa conversa e a tela
 * ficar na anterior. A causa é sempre a mesma corrida entre a seleção (estado
 * do React) e o `?leadId=` do endereço, e ela NÃO aparece em teste de tipo nem
 * no build — só clicando, e nem sempre.
 *
 * Aqui os dois lados são modelados sem navegador: a regra que o chat usa
 * (src/app/(authenticated)/chat/page.tsx) roda contra os quatro cenários que
 * importam. Mexeu naquele efeito? Rode isto antes de subir.
 *
 * Reproduz as duas coisas que quebravam na tela de verdade:
 *   1. `searchParams` chega uma renderização DEPOIS do replaceState;
 *   2. em alguns casos ele nunca chega (o endereço muda na barra, mas o
 *      componente continua lendo o valor antigo).
 *
 * Cenário: a pessoa abre o chat (com ou sem ?leadId= no link) e depois clica em
 * outras conversas. O esperado é óbvio — a tela mostra o que ela clicou.
 */
function rodar({ versao, cliques, urlInicial, enderecoSincroniza }) {
  let selecionado = null
  let urlReal = urlInicial
  let urlVistaPeloReact = urlInicial
  const refs = { aplicado: null, ultimaUrlVista: null, escolhidaAqui: null }
  const leadsEmMemoria = new Set(['A', 'B', 'C'])

  const efeito = () => {
    const url = urlVistaPeloReact
    if (!url) return

    if (versao === 'antiga') {
      if (refs.aplicado === url) return
      if (selecionado === url) { refs.aplicado = url; return }
      if (leadsEmMemoria.has(url)) { refs.aplicado = url; selecionado = url }
      return
    }

    // nova: regra de borda — só age quando o endereço vira outro de verdade
    if (url === refs.ultimaUrlVista) return
    refs.ultimaUrlVista = url
    if (url === refs.escolhidaAqui) return
    if (selecionado === url) return
    if (leadsEmMemoria.has(url)) selecionado = url
  }

  const renderizar = () => {
    efeito()
    if (enderecoSincroniza) urlVistaPeloReact = urlReal
  }

  renderizar() // abertura da página
  renderizar()

  const historico = []
  for (const lead of cliques) {
    if (versao === 'antiga') refs.aplicado = lead
    else refs.escolhidaAqui = lead
    selecionado = lead
    urlReal = lead
    renderizar() // quadro logo após o clique: seleção nova, endereço ainda velho
    renderizar() // quadro seguinte
    historico.push({ clicou: lead, tela: selecionado })
  }
  return historico
}

const CENARIOS = [
  { nome: 'abriu por link (?leadId=A), endereço acompanha', urlInicial: 'A', enderecoSincroniza: true },
  { nome: 'abriu por link (?leadId=A), endereço NÃO acompanha', urlInicial: 'A', enderecoSincroniza: false },
  { nome: 'abriu sem link, endereço acompanha', urlInicial: null, enderecoSincroniza: true },
  { nome: 'abriu sem link, endereço NÃO acompanha', urlInicial: null, enderecoSincroniza: false },
]

const cliques = ['B', 'C', 'B', 'A']
let falhouNaNova = false

for (const cenario of CENARIOS) {
  console.log(`\n### ${cenario.nome}`)
  for (const versao of ['antiga', 'nova']) {
    const historico = rodar({ versao, cliques, ...cenario })
    const erros = historico.filter((h) => h.clicou !== h.tela)
    if (erros.length && versao === 'nova') falhouNaNova = true
    console.log(
      `  regra ${versao}: ${erros.length ? 'FALHA' : 'ok'}` +
        (erros.length ? ` — ${erros.map((e) => `clicou ${e.clicou}, ficou em ${e.tela}`).join('; ')}` : '')
    )
  }
}

console.log(
  falhouNaNova
    ? '\nRESULTADO: a regra nova ainda falha.'
    : '\nRESULTADO: a regra nova acerta em todos os cenários.'
)
process.exit(falhouNaNova ? 1 : 0)
