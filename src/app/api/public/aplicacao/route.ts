/**
 * POST /api/public/aplicacao — o formulário de aplicação do site manda aqui.
 *
 * É o ÚNICO endpoint do CRM que roda sem credencial, e por um motivo concreto:
 * quem envia é o navegador de quem está se inscrevendo, numa página do
 * WordPress. Qualquer token colocado ali estaria à vista de todo mundo no
 * código-fonte da página — e os tokens de API deste CRM dão acesso à
 * organização inteira.
 *
 * O que substitui o token:
 *   - só aceita requisição vinda do site (Origin na lista abaixo);
 *   - só escreve na fonte "site_evento", nunca em outra;
 *   - exige nome e um WhatsApp plausível;
 *   - campo-armadilha invisível (`website`): robô preenche, gente não;
 *   - limite por IP na mesma instância, pra travar envio em rajada.
 *
 * Daqui pra baixo é o mesmo caminho das fontes externas (handleIngest): mesma
 * normalização de telefone, mesmo dedupe, mesmo registro em
 * lead_source_submissions. O lead do popup (nome/e-mail/WhatsApp) e as
 * respostas desta etapa acabam na MESMA pessoa porque a fonte site_evento
 * identifica o lead pelo telefone.
 */
import { NextRequest } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organizations } from '@/lib/schema'
import { handleIngest } from '@/lib/ingest'
import { apiError } from '@/lib/api-auth'

/** De onde o formulário pode chamar. Sem Origin (curl, teste) também passa. */
const ORIGENS_PERMITIDAS = [
  'https://ascensaotita.com',
  'https://www.ascensaotita.com',
]

const FONTE = 'site_evento'

/** Uma inscrição a cada 20s por IP é folgado pra gente e apertado pra robô. */
const ESPERA_ENTRE_ENVIOS_MS = 20_000
const ultimoEnvioPorIp = new Map<string, number>()

function corsHeaders(origin: string | null): Record<string, string> {
  const permitida = origin && ORIGENS_PERMITIDAS.includes(origin)
  return {
    'Access-Control-Allow-Origin': permitida ? origin : ORIGENS_PERMITIDAS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  try {
    if (origin && !ORIGENS_PERMITIDAS.includes(origin)) {
      return apiError(403, 'Origem não autorizada.')
    }

    const corpo = await req.json().catch(() => null)
    if (!corpo || typeof corpo !== 'object') {
      return Response.json({ error: 'Envie um JSON com as respostas.' }, { status: 400, headers })
    }

    // Armadilha: o campo existe no HTML, fica escondido e ninguém digita nele.
    // Responde 200 de propósito — robô que recebe erro tenta de novo.
    if (String((corpo as Record<string, unknown>).website ?? '').trim()) {
      return Response.json({ data: { ok: true } }, { status: 200, headers })
    }

    const nome = String((corpo as Record<string, unknown>).nome ?? '').trim()
    const whatsapp = String((corpo as Record<string, unknown>).whatsapp ?? '')
    const digitos = whatsapp.replace(/\D/g, '')
    if (nome.length < 2) {
      return Response.json({ error: 'Informe seu nome.' }, { status: 400, headers })
    }
    // 10 = fixo com DDD, 11 = celular, 12/13 = com o 55 na frente.
    if (digitos.length < 10 || digitos.length > 15) {
      return Response.json({ error: 'Informe um WhatsApp válido, com DDD.' }, { status: 400, headers })
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sem-ip'
    const agora = Date.now()
    const ultimo = ultimoEnvioPorIp.get(ip)
    if (ultimo && agora - ultimo < ESPERA_ENTRE_ENVIOS_MS) {
      return Response.json({ error: 'Calma, sua inscrição já foi recebida.' }, { status: 429, headers })
    }
    ultimoEnvioPorIp.set(ip, agora)
    // A memória é por instância e some sozinha; limpa o que já não segura nada.
    if (ultimoEnvioPorIp.size > 500) {
      for (const [chave, quando] of ultimoEnvioPorIp) {
        if (agora - quando > ESPERA_ENTRE_ENVIOS_MS) ultimoEnvioPorIp.delete(chave)
      }
    }

    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(process.env.ORG_FORMULARIO_PUBLICO
        ? and(eq(organizations.id, process.env.ORG_FORMULARIO_PUBLICO), isNull(organizations.deletedAt))
        : isNull(organizations.deletedAt))
      .limit(1)
    if (!org) return Response.json({ error: 'Organização não encontrada.' }, { status: 500, headers })

    // Refaz a requisição pro caminho comum: corpo limpo, fonte fixa. `website`
    // (a armadilha) fica de fora pra não virar campo do lead.
    const { website: _armadilha, ...limpo } = corpo as Record<string, unknown>
    const interna = new NextRequest(new URL('/api/ingest/leads/site_evento', req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(limpo),
    })

    const resposta = await handleIngest(interna, FONTE, { organizationId: org.id, memberId: null })
    const dados = await resposta.json().catch(() => ({}))
    return Response.json(dados, { status: resposta.status, headers })
  } catch (err: any) {
    console.error('[aplicacao] falhou:', err)
    return Response.json({ error: 'Não consegui registrar agora. Tente de novo.' }, { status: 500, headers })
  }
}
