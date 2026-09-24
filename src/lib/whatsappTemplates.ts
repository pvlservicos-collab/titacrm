/**
 * Templates da API Oficial do WhatsApp (mensagens modelo aprovadas pela Meta).
 *
 * Template é o único jeito de a empresa começar uma conversa na API Oficial:
 * fora da janela de 24h desde a última mensagem do cliente, texto livre é
 * recusado pela Meta. Por isso o chat tem o botão "Enviar template".
 *
 * Só entram templates que dá pra mandar com texto: cabeçalho de mídia
 * (imagem/vídeo/documento), carrossel e botão com URL variável exigem
 * parâmetros que este envio não monta — eles aparecem na lista da Meta mas
 * ficam de fora aqui, em vez de falhar na hora do envio.
 */
import { db } from '@/lib/db'
import { integrations } from '@/lib/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { getWhatsAppCredentials, numeroParaEnvio } from '@/lib/whatsapp'

export interface TemplateResumo {
  name: string
  language: string
  category: string
  header: string | null
  body: string
  footer: string | null
  buttons: string[]
  /** Quantas variáveis {{n}} o corpo tem. */
  bodyParams: number
  /** Quantas variáveis {{n}} o cabeçalho de texto tem (0 ou 1 na Meta). */
  headerParams: number
}

const contarVariaveis = (texto: string) => new Set(texto.match(/\{\{\s*\d+\s*\}\}/g) || []).size

/** Troca {{1}}, {{2}}... pelos valores, na ordem. */
export function preencher(texto: string, valores: string[]): string {
  return texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (marca, n) => valores[Number(n) - 1] ?? marca)
}

/**
 * Texto que o cliente vê, na ordem do WhatsApp: cabeçalho, corpo, rodapé.
 * Sem as marcas *negrito* / _itálico_: a conversa do CRM mostra texto puro, e
 * elas apareceriam como asteriscos soltos.
 */
export function renderizar(t: TemplateResumo, bodyValores: string[], headerValores: string[] = []): string {
  return [
    t.header ? preencher(t.header, headerValores) : null,
    preencher(t.body, bodyValores),
    t.footer || null,
  ].filter(Boolean).join('\n\n')
}

function resumir(t: any): TemplateResumo | null {
  // QUALITY_PENDING tambem envia (mesmo criterio do app modelo da Meta): e um
  // template aprovado que a Meta ainda esta avaliando a qualidade.
  if (t.status !== 'APPROVED' && t.status !== 'QUALITY_PENDING') return null
  const comps: any[] = t.components || []
  if (comps.some((c) => c.type === 'CAROUSEL')) return null

  const header = comps.find((c) => c.type === 'HEADER')
  if (header && header.format && header.format !== 'TEXT') return null

  const body = comps.find((c) => c.type === 'BODY')
  if (!body?.text) return null

  const botoes: any[] = comps.find((c) => c.type === 'BUTTONS')?.buttons || []
  if (botoes.some((b) => b.type === 'URL' && /\{\{\s*\d+\s*\}\}/.test(b.url || ''))) return null

  return {
    name: t.name,
    language: t.language,
    category: t.category,
    header: header?.text || null,
    body: body.text,
    footer: comps.find((c) => c.type === 'FOOTER')?.text || null,
    buttons: botoes.map((b) => b.text).filter(Boolean),
    bodyParams: contarVariaveis(body.text),
    headerParams: header?.text ? contarVariaveis(header.text) : 0,
  }
}

async function wabaDaOrganizacao(organizationId: string): Promise<string> {
  const [integ] = await db.select({ config: integrations.config }).from(integrations)
    .where(and(eq(integrations.organizationId, organizationId), eq(integrations.type, 'whatsapp_cloud_official'), isNull(integrations.deletedAt)))
    .limit(1)
  const waba = (integ?.config as { waba_id?: string } | undefined)?.waba_id
  if (!waba) throw { status: 400, message: 'API Oficial sem WABA ID configurado.' }
  return waba
}

/** Erro da Graph API com a mensagem dela, que é a que explica o problema. */
function erroDaMeta(j: any, fallback: string) {
  const e = j?.error
  const detalhe = e?.error_data?.details || e?.message
  const codigo = e?.code === 190 ? ' O token de acesso expirou: gere outro no painel da Meta.' : ''
  return { status: 502, message: `${detalhe || fallback}${codigo}` }
}

export async function listarTemplates(organizationId: string): Promise<TemplateResumo[]> {
  const { apiVersion, token } = await getWhatsAppCredentials(organizationId)
  const waba = await wabaDaOrganizacao(organizationId)
  const res = await fetch(
    `https://graph.facebook.com/${apiVersion}/${waba}/message_templates?fields=name,language,status,category,components&limit=100`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw erroDaMeta(j, 'Não consegui buscar os templates na Meta.')
  return ((j.data || []) as any[]).map(resumir).filter((t): t is TemplateResumo => !!t)
}

export async function buscarTemplate(organizationId: string, name: string, language: string) {
  const todos = await listarTemplates(organizationId)
  return todos.find((t) => t.name === name && t.language === language) || null
}

/**
 * Envia o template. Devolve o id da mensagem e o wa_id que a Meta resolveu:
 * pra celular brasileiro ele pode vir sem o nono dígito, e é esse número que
 * vai aparecer nas respostas do cliente (ver webhooks/facebook).
 */
export async function enviarTemplate(
  organizationId: string,
  para: string,
  t: TemplateResumo,
  bodyValores: string[],
  headerValores: string[],
): Promise<{ messageId: string | null; waId: string | null }> {
  const { apiVersion, phoneNumberId, token } = await getWhatsAppCredentials(organizationId)
  const components: any[] = []
  if (t.headerParams > 0) {
    components.push({ type: 'header', parameters: headerValores.slice(0, t.headerParams).map((text) => ({ type: 'text', text })) })
  }
  if (t.bodyParams > 0) {
    components.push({ type: 'body', parameters: bodyValores.slice(0, t.bodyParams).map((text) => ({ type: 'text', text })) })
  }

  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numeroParaEnvio(para),
      type: 'template',
      template: { name: t.name, language: { code: t.language }, ...(components.length ? { components } : {}) },
    }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw erroDaMeta(j, 'A Meta recusou o envio do template.')
  return { messageId: j.messages?.[0]?.id ?? null, waId: j.contacts?.[0]?.wa_id ?? null }
}
