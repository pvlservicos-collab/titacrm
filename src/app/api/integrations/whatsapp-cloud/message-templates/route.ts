/**
 * Modelos de mensagem (templates) da conta do WhatsApp — whatsapp_business_management.
 *
 * GET    → todos os modelos da WABA, com status (aprovado, em análise, rejeitado...).
 * POST   → cria um modelo e manda pra análise da Meta.
 *          Body: { name, category, language, header?, body, footer?, examples: string[],
 *                  header_example?, buttons?: string[] }
 * DELETE → ?name=... exclui o modelo (todas as línguas dele).
 *
 * A Meta exige exemplo pra cada variável {{n}} do corpo (e do cabeçalho) — é
 * com eles que o revisor entende a mensagem. As regras de formato conferidas
 * aqui são as que a Meta recusa na hora; o resto (conteúdo, categoria certa)
 * é decisão da análise dela, e a mensagem de erro dela volta pra tela.
 */
import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { exigirGestaoDeIntegracoes } from '@/lib/admin-auth'
import { exigirIntegracaoCloud } from '@/lib/whatsappIntegracao'
import { graphGet, graphPost, GRAPH_VERSION } from '@/lib/meta'

const CATEGORIAS = ['UTILITY', 'MARKETING']
const IDIOMAS = ['pt_BR', 'en_US', 'es', 'es_MX', 'pt_PT']

const variaveis = (texto: string) => (texto.match(/\{\{\s*(\d+)\s*\}\}/g) || []).map((v) => Number(v.replace(/\D/g, '')))

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await exigirGestaoDeIntegracoes(auth)
    const { token, wabaId } = await exigirIntegracaoCloud(auth.organizationId)
    const j = await graphGet(
      `/${wabaId}/message_templates?fields=id,name,category,language,status,rejected_reason,quality_score,components&limit=200`,
      token,
    )
    return Response.json({ waba_id: wabaId, modelos: j.data || [] })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await exigirGestaoDeIntegracoes(auth)
    const b = await req.json().catch(() => ({}))

    const name = String(b.name || '').trim()
    const category = String(b.category || '').toUpperCase()
    const language = String(b.language || '')
    const header = String(b.header || '').trim()
    const body = String(b.body || '').trim()
    const footer = String(b.footer || '').trim()
    const examples: string[] = Array.isArray(b.examples) ? b.examples.map((x: unknown) => String(x ?? '').trim()) : []
    const headerExample = String(b.header_example || '').trim()
    const buttons: string[] = Array.isArray(b.buttons) ? b.buttons.map((x: unknown) => String(x ?? '').trim()).filter(Boolean) : []

    if (!/^[a-z0-9_]{1,512}$/.test(name)) return apiError(400, 'Nome: só letras minúsculas, números e _ (ex.: confirmacao_agenda).')
    if (!CATEGORIAS.includes(category)) return apiError(400, 'Categoria inválida.')
    if (!IDIOMAS.includes(language)) return apiError(400, 'Idioma inválido.')
    if (!body) return apiError(400, 'O corpo da mensagem é obrigatório.')
    if (body.length > 1024) return apiError(400, 'O corpo passa de 1024 caracteres.')
    if (header.length > 60) return apiError(400, 'O cabeçalho passa de 60 caracteres.')
    if (footer.length > 60) return apiError(400, 'O rodapé passa de 60 caracteres.')
    if (variaveis(footer).length) return apiError(400, 'O rodapé não pode ter variáveis.')
    if (buttons.length > 3 || buttons.some((t) => t.length > 25)) return apiError(400, 'Até 3 botões de resposta, com até 25 caracteres cada.')

    const noCorpo = [...new Set(variaveis(body))].sort((a, b) => a - b)
    if (noCorpo.some((n, i) => n !== i + 1)) return apiError(400, 'As variáveis do corpo precisam ser {{1}}, {{2}}, {{3}}... em sequência.')
    if (/^\s*\{\{\s*\d+\s*\}\}/.test(body) || /\{\{\s*\d+\s*\}\}\s*[.!?]?\s*$/.test(body)) {
      return apiError(400, 'A Meta não aceita o corpo começando ou terminando com uma variável.')
    }
    if (examples.slice(0, noCorpo.length).filter(Boolean).length < noCorpo.length) {
      return apiError(400, 'Preencha um exemplo para cada variável do corpo.')
    }
    const noCabecalho = variaveis(header)
    if (noCabecalho.length > 1 || (noCabecalho.length === 1 && noCabecalho[0] !== 1)) return apiError(400, 'O cabeçalho aceita só a variável {{1}}.')
    if (noCabecalho.length === 1 && !headerExample) return apiError(400, 'Preencha o exemplo da variável do cabeçalho.')

    const components: any[] = []
    if (header) {
      components.push({ type: 'HEADER', format: 'TEXT', text: header, ...(noCabecalho.length ? { example: { header_text: [headerExample] } } : {}) })
    }
    components.push({ type: 'BODY', text: body, ...(noCorpo.length ? { example: { body_text: [examples.slice(0, noCorpo.length)] } } : {}) })
    if (footer) components.push({ type: 'FOOTER', text: footer })
    if (buttons.length) components.push({ type: 'BUTTONS', buttons: buttons.map((text) => ({ type: 'QUICK_REPLY', text })) })

    const { token, wabaId } = await exigirIntegracaoCloud(auth.organizationId)
    const criado = await graphPost(`/${wabaId}/message_templates`, token, { name, category, language, components })
    return Response.json({ ok: true, id: criado.id, status: criado.status, category: criado.category, graph_version: GRAPH_VERSION })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await exigirGestaoDeIntegracoes(auth)
    const name = req.nextUrl.searchParams.get('name') || ''
    if (!/^[a-z0-9_]{1,512}$/.test(name)) return apiError(400, 'Nome do modelo inválido.')
    const { token, wabaId } = await exigirIntegracaoCloud(auth.organizationId)
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j?.error) return apiError(502, j?.error?.error_user_msg || j?.error?.message || 'A Meta não excluiu o modelo.')
    return Response.json({ ok: true })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
