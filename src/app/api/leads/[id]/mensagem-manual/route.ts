import { NextRequest } from 'next/server'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { leads, funnelBlocks, messageFunnels, leadSourceSubmissions } from '@/lib/schema'
import { escolherMensagemDaAgenda } from '@/lib/mensagensAgenda'
import { aplicarVariaveis } from '@/lib/funnel-engine'

/**
 * GET /api/leads/{id}/mensagem-manual
 *
 * A mensagem que ESTE lead receberia da automação, pronta pra equipe mandar na
 * mão — é o que a coluna "Link manual" precisa: gente que nunca recebeu nada
 * porque o WhatsApp estava fora do ar, e que vai ser chamada uma a uma.
 *
 * É a MESMA escolha do funil (src/lib/mensagensAgenda.ts): a primeira das seis
 * situações que se encaixa na agenda da pessoa; nenhuma se encaixa, vai o texto
 * padrão do funil daquela fonte — lido do próprio bloco, pra não existir uma
 * segunda cópia do texto que envelhece sozinha.
 */
const PADRAO_AGENDA =
  'Oi {nome}! Aqui é a Michele da equipe do Augusto Titã 😁\n\nRecebemos sua aplicação para uma sessão de avaliação da sua agenda e gestão de tempo!\nMe conta rapidinho: o que você mais gostaria de melhorar hoje?'

async function textoPadraoDoFunil(organizationId: string, source: string | null): Promise<string> {
  const trigger = source === 'site_evento' ? 'lead_site_evento' : 'lead_agenda_ascensao'
  /*
   * O funil de boas-vindas, não o teste A/B/C — os dois têm o mesmo gatilho da
   * Agenda, e pegar "o primeiro" trazia o texto de quem não terminou a
   * aplicação pra gente que nunca recebeu nada. O de boas-vindas é o mais
   * antigo, e é o que tem a personalização ligada.
   */
  const blocos = await db
    .select({ config: funnelBlocks.config, criadoEm: messageFunnels.createdAt })
    .from(funnelBlocks)
    .innerJoin(messageFunnels, eq(messageFunnels.id, funnelBlocks.funnelId))
    .where(and(
      eq(messageFunnels.organizationId, organizationId),
      eq(messageFunnels.trigger, trigger as any),
      isNull(messageFunnels.deletedAt),
      eq(funnelBlocks.type, 'message')
    ))
    .orderBy(asc(messageFunnels.createdAt))

  const comPersonalizacao = blocos.find((b) => (b.config as { personalizar?: string })?.personalizar === 'agenda')
  const texto = ((comPersonalizacao ?? blocos[0])?.config as { text?: string } | undefined)?.text
  return typeof texto === 'string' && texto.trim() ? texto : PADRAO_AGENDA
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    const { id } = await params

    const [lead] = await db
      .select({
        id: leads.id,
        title: leads.title,
        phone: leads.phone,
        isGroup: leads.isGroup,
        customAttributes: leads.customAttributes,
      })
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.organizationId, auth.organizationId), isNull(leads.deletedAt)))
      .limit(1)
    if (!lead) return apiError(404, 'Lead não encontrado.')
    if (lead.isGroup) return apiError(400, 'Grupo não recebe mensagem de link manual.')

    const atributos = (lead.customAttributes ?? {}) as Record<string, unknown>

    /*
     * O quiz pode não estar no lead: a lista não carrega a agenda montada, e
     * nos leads antigos (antes de 16/09) o reenvio atualizava só o cadastro.
     * Medido em 22/09: 107 dos 222 do Link manual estavam assim, e sem esta
     * saída quase todos receberiam a mensagem padrão em vez da que combina com
     * a agenda deles. O cadastro é a fonte original — vale como reserva.
     */
    let paraEscolher = atributos
    if (!atributos.a1) {
      const [cadastro] = await db
        .select({ payload: leadSourceSubmissions.payload })
        .from(leadSourceSubmissions)
        .where(eq(leadSourceSubmissions.leadId, lead.id))
        .orderBy(desc(leadSourceSubmissions.updatedAt))
        .limit(1)
      const payload = (cadastro?.payload ?? {}) as Record<string, unknown>
      if (payload.a1) paraEscolher = { ...payload, ...atributos, a1: payload.a1 }
    }

    const escolhida = escolherMensagemDaAgenda(paraEscolher)
    const base = escolhida?.texto ?? (await textoPadraoDoFunil(auth.organizationId, (atributos.lead_source as string) ?? null))
    const texto = aplicarVariaveis(base, lead.title, atributos)

    const telefone = (lead.phone || '').replace(/\D/g, '')
    return Response.json({
      data: {
        texto,
        // Qual das seis saiu ('padrao' quando nenhuma se encaixou) — a tela mostra.
        regra: escolhida?.id ?? 'padrao',
        link: telefone ? `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}` : null,
      },
    })
  } catch (err: any) {
    if (err?.status) return apiError(err.status, err.message)
    console.error('[mensagem-manual] falhou:', err)
    return apiError(500, 'Erro ao montar a mensagem.')
  }
}
