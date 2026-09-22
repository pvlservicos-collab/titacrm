/**
 * As linhas de WhatsApp (os números) e a cor de cada uma.
 *
 * No Kanban, COR = NÚMERO. Olhando a coluna dá pra ver por qual linha cada
 * conversa está acontecendo — o número da empresa, o do Augusto, o da Michele —
 * sem abrir card nenhum. Quem está atendendo é outra informação, e aparece como
 * etiqueta dentro do card (ver src/lib/atendentes.ts).
 *
 * O rótulo e a cor saem do NOME da integração, cadastrado no painel, porque é
 * ele que a pessoa controla. Conectar um número novo com "Augusto" no nome já
 * pinta os cards dele de amarelo, sem mexer em código.
 *
 * As cores das pessoas são as mesmas do chat de propósito: o amarelo do Augusto
 * é o mesmo em todo lugar.
 */

export interface LinhaWhatsapp {
  /** id da integração; `sem-linha` pra quem ainda não conversou por nenhuma. */
  id: string
  rotulo: string
  cor: string
  /**
   * Já existe número ligado nessa linha?
   *
   * As três linhas previstas aparecem no menu desde já, mesmo sem número
   * conectado — é assim que dá pra montar a operação antes de plugar os
   * aparelhos. A linha ainda não conectada aparece apagada e não filtra nada,
   * porque não existe lead nela.
   */
  conectada: boolean
}

/**
 * As linhas previstas da operação, na ordem do menu.
 *
 * `contem` é o que se procura no nome da integração cadastrada no painel:
 * conectar um número com "Augusto" no nome já casa com a linha dele. O número
 * da automação (Z-API) casa com "Empresas" mesmo sem a palavra no nome.
 */
const LINHAS_PREVISTAS: { contem: string[]; rotulo: string; cor: string }[] = [
  { contem: ['empresa', 'z-api', 'zapi'], rotulo: 'WhatsApp Empresas', cor: '#2FAE8C' }, // verde
  { contem: ['augusto'], rotulo: 'WhatsApp Augusto', cor: '#FACC15' }, // amarelo
  { contem: ['michele'], rotulo: 'WhatsApp Michele', cor: '#C084FC' }, // roxo
]

/** Números conectados que não casam com ninguém acima. */
const CORES_RESERVA = ['#F472B6', '#FB923C', '#22D3EE', '#A3E635', '#E879F9']

/** Lead que ainda não trocou mensagem por nenhuma linha. */
export const SEM_LINHA: LinhaWhatsapp = {
  id: 'sem-linha',
  rotulo: 'Sem número',
  cor: '#7b7b76',
  conectada: true,
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Integrações → linhas, na ordem em que devem aparecer.
 *
 * O número da empresa (o da automação) vem primeiro: é por onde a maior parte
 * do movimento acontece.
 */
export function montarLinhas(
  integracoes: { id: string; name?: string | null; type?: string | null }[]
): LinhaWhatsapp[] {
  const usadas = new Set<string>()

  // As três previstas sempre aparecem, conectadas ou não.
  const linhas: LinhaWhatsapp[] = LINHAS_PREVISTAS.map((prevista) => {
    const casou = integracoes.find((i) => {
      if (usadas.has(i.id)) return false
      const nome = semAcento(i.name || '')
      return prevista.contem.some((pedaco) => nome.includes(pedaco))
    })
    if (casou) usadas.add(casou.id)
    return {
      id: casou?.id ?? `prevista:${prevista.rotulo}`,
      rotulo: prevista.rotulo,
      cor: prevista.cor,
      conectada: !!casou,
    }
  })

  // Número conectado que não é nenhuma das previstas entra depois, com cor
  // de reserva — ninguém fica invisível por ter nome inesperado.
  let reserva = 0
  for (const i of integracoes) {
    if (usadas.has(i.id)) continue
    linhas.push({
      id: i.id,
      rotulo: i.name || 'WhatsApp',
      cor: CORES_RESERVA[reserva++ % CORES_RESERVA.length],
      conectada: true,
    })
  }

  return linhas
}

/** A linha de um lead, pelo id da integração dele. */
export function linhaDoLead(
  integrationId: string | null | undefined,
  porId: Record<string, LinhaWhatsapp>
): LinhaWhatsapp {
  if (!integrationId) return SEM_LINHA
  return porId[integrationId] ?? SEM_LINHA
}
