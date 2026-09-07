/**
 * Recebimento de leads das fontes externas — lógica compartilhada pelas duas
 * rotas de entrada:
 *
 *   POST /api/ingest/leads            → `source` vem no corpo
 *   POST /api/ingest/leads/{source}   → `source` vem na URL
 *
 * A segunda existe por causa do WordPress: a maioria dos plugins de formulário
 * (WPForms, Elementor, Fluent Forms, CF7 + addon) manda os campos do formulário
 * e nada mais — não dá pra acrescentar um `source` fixo no corpo. Com o source
 * na URL, o plugin só precisa saber colar um endereço.
 *
 * Pelo mesmo motivo esta camada é tolerante em três pontos onde a API "pura"
 * seria estrita. Nenhum deles é frouxidão: são limitações reais dos plugins.
 *
 *   1. Autenticação também por `?key=atl_...` na URL. Vários plugins não têm
 *      campo pra cabeçalho HTTP customizado, então exigir `Authorization` os
 *      deixaria de fora. O cabeçalho continua sendo o caminho preferido —
 *      chave em query string aparece em log de servidor e no histórico do
 *      navegador, então quem PODE mandar cabeçalho deve mandar.
 *   2. Corpo em `application/x-www-form-urlencoded` / `multipart/form-data`
 *      além de JSON. Boa parte dos plugins posta o formulário cru.
 *   3. Apelidos de campo: o nome do campo no WordPress é o que o autor do
 *      formulário escolheu ("your-name", "telefone", "field_3"), não o nosso.
 */
import { NextRequest } from 'next/server'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { leadSourceSubmissions, leads, pipelineStages } from '@/lib/schema'
import { isUniqueViolation } from '@/lib/db-helpers'
import {
  LEAD_SOURCE_ORDER,
  dedupeKeyFor,
  getLeadSource,
  type LeadSourceKey,
  type NormalizedLead,
} from '@/lib/leadSources'
import { startFunnelForSource } from '@/lib/funnel-triggers'

/**
 * Apelidos aceitos para os campos de contato, na ordem de preferência.
 *
 * Só vale para os campos que TODO formulário tem (nome, e-mail, telefone) — os
 * campos estruturados da Agenda (`agenda.a1`, `agenda.real`) vêm de um sistema
 * nosso, que manda os nomes certos, e não entram aqui.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  nome: ['nome', 'name', 'nome_completo', 'nomecompleto', 'full_name', 'fullname', 'your-name', 'seu-nome', 'first_name'],
  email: ['email', 'e-mail', 'e_mail', 'mail', 'your-email', 'seu-email'],
  whatsapp: ['whatsapp', 'whats', 'telefone', 'phone', 'celular', 'tel', 'fone', 'numero', 'número', 'your-phone', 'seu-telefone'],
  instagram: ['instagram', 'insta', 'ig', '@instagram'],
  id: ['id', 'lead_id', 'external_id'],
}

/** "Seu Nome" / "seu_nome" / "seu-nome" / "SEU NOME" viram todos "seunome". */
function fieldKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // marcas de acento que o NFD acabou de separar
    .replace(/[\s_-]/g, '')
}

/**
 * Preenche os nomes canônicos a partir dos apelidos, sem sobrescrever o que já
 * veio com o nome certo.
 *
 * Exportada (junto com parseBody) porque é aqui que mora a compatibilidade com
 * os formulários do WordPress — a parte mais fácil de quebrar sem perceber, e a
 * única que dá pra testar sem banco.
 */
export function applyAliases(body: Record<string, any>): Record<string, any> {
  const normalizedKeys = new Map<string, string>()
  for (const key of Object.keys(body)) {
    normalizedKeys.set(fieldKey(key), key)
  }

  const result = { ...body }
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    const current = result[canonical]
    if (current !== undefined && current !== null && String(current).trim() !== '') continue

    for (const alias of aliases) {
      const actualKey = normalizedKeys.get(fieldKey(alias))
      if (actualKey === undefined) continue
      const value = body[actualKey]
      if (value === undefined || value === null || String(value).trim() === '') continue
      result[canonical] = value
      break
    }
  }
  return result
}

/**
 * Lê o corpo em qualquer um dos formatos que os plugins mandam.
 *
 * Em formulário urlencoded tudo chega string, inclusive o que deveria ser
 * objeto. Se o valor parecer JSON (`{...}` / `[...]`) a gente tenta desserializar
 * — é assim que um formulário consegue mandar o `agenda` inteiro num campo só.
 */
export async function parseBody(req: NextRequest): Promise<Record<string, any> | null> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      const parsed = await req.json()
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    try {
      const form = await req.formData()
      const out: Record<string, any> = {}
      for (const [key, value] of form.entries()) {
        const raw = typeof value === 'string' ? value : null
        if (raw === null) continue
        const trimmedValue = raw.trim()
        if (
          (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
          (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))
        ) {
          try {
            out[key] = JSON.parse(trimmedValue)
            continue
          } catch {
            /* não era JSON — segue como texto */
          }
        }
        out[key] = raw
      }
      return out
    } catch {
      return null
    }
  }

  // Sem Content-Type reconhecível (alguns plugins não mandam nenhum): última
  // tentativa lendo como texto e adivinhando entre JSON e querystring.
  try {
    const text = (await req.text()).trim()
    if (!text) return {}
    if (text.startsWith('{')) return JSON.parse(text)
    const params = new URLSearchParams(text)
    const out: Record<string, any> = {}
    for (const [key, value] of params.entries()) out[key] = value
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}

/**
 * Autentica pelo cabeçalho e, se não houver, por `?key=`.
 *
 * O fallback monta uma requisição com o cabeçalho preenchido em vez de
 * reimplementar a checagem do token — assim continua existindo um único lugar
 * que sabe validar credencial (authenticateRequest).
 */
async function authenticate(req: NextRequest) {
  if (req.headers.get('authorization')) return authenticateRequest(req)

  const key = req.nextUrl.searchParams.get('key') || req.nextUrl.searchParams.get('token')
  if (!key) return authenticateRequest(req)

  const headers = new Headers(req.headers)
  headers.set('authorization', `Bearer ${key}`)
  return authenticateRequest(new NextRequest(req.nextUrl, { headers }) as NextRequest)
}

/** Cria o lead no CRM ou devolve o que já existe pro mesmo telefone. */
async function upsertCrmLead(
  organizationId: string,
  source: LeadSourceKey,
  normalized: NormalizedLead
): Promise<{ id: string; created: boolean } | null> {
  if (normalized.phone) {
    const [existing] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(
        eq(leads.organizationId, organizationId),
        eq(leads.phone, normalized.phone),
        isNull(leads.deletedAt)
      ))
      .limit(1)
    if (existing) return { id: existing.id, created: false }
  }

  const [firstStage] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(and(
      eq(pipelineStages.organizationId, organizationId),
      isNull(pipelineStages.deletedAt)
    ))
    .orderBy(asc(pipelineStages.rank))
    .limit(1)

  try {
    const [lead] = await db
      .insert(leads)
      .values({
        organizationId,
        title: normalized.name,
        phone: normalized.phone,
        email: normalized.email,
        stageId: firstStage?.id ?? null,
        customAttributes: { lead_source: source, ...normalized.fields },
        lastActivityAt: new Date(),
      })
      .returning({ id: leads.id })
    return lead ? { id: lead.id, created: true } : null
  } catch (err) {
    // leads_org_phone_unique: outra requisição criou o mesmo telefone entre o
    // SELECT acima e este INSERT. Busca de novo em vez de estourar.
    if (!isUniqueViolation(err) || !normalized.phone) throw err
    const [raceLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(
        eq(leads.organizationId, organizationId),
        eq(leads.phone, normalized.phone),
        isNull(leads.deletedAt)
      ))
      .limit(1)
    return raceLead ? { id: raceLead.id, created: false } : null
  }
}

/**
 * Trata uma requisição de entrada de lead.
 *
 * `sourceFromPath` vem preenchido quando a rota é /api/ingest/leads/{source};
 * nesse caso a URL manda e o corpo nem precisa trazer `source`.
 */
export async function handleIngest(req: NextRequest, sourceFromPath?: string) {
  try {
    const auth = await authenticate(req)

    const rawBody = await parseBody(req)
    if (rawBody === null) {
      return apiError(400, 'Corpo inválido: envie JSON ou os campos do formulário (urlencoded / multipart).')
    }
    const body = applyAliases(rawBody)

    const sourceDef = getLeadSource(sourceFromPath ?? body.source)
    if (!sourceDef) {
      return apiError(
        400,
        `Fonte desconhecida: ${JSON.stringify(sourceFromPath ?? body.source ?? null)}. ` +
        `Valores aceitos: ${LEAD_SOURCE_ORDER.join(', ')}.`
      )
    }

    const faltando = sourceDef.required.filter((field) => {
      const value = body[field]
      return value === undefined || value === null || String(value).trim() === ''
    })
    if (faltando.length > 0) {
      return apiError(
        400,
        `Campos obrigatórios ausentes para a fonte "${sourceDef.key}": ${faltando.join(', ')}. ` +
        `Campos recebidos: ${Object.keys(rawBody).join(', ') || '(nenhum)'}.`
      )
    }

    const normalized = sourceDef.normalize(body)
    const dedupeKey = dedupeKeyFor(sourceDef.key, normalized)

    const values = {
      organizationId: auth.organizationId,
      source: sourceDef.key,
      externalId: dedupeKey,
      name: normalized.name,
      email: normalized.email,
      phone: normalized.phone,
      instagram: normalized.instagram,
      payload: normalized.fields,
      receivedAt: new Date(),
      updatedAt: new Date(),
    }

    // Com chave de dedupe, reenviar o mesmo lead atualiza a linha (o caso real:
    // o quiz da Agenda sai de "w1" pra "done" e é mandado de novo). Sem chave,
    // cada requisição vira uma linha nova. `received_at` não entra no UPDATE de
    // propósito: a coluna registra quando aquele lead apareceu pela primeira
    // vez; quando ele mudou é `updated_at`.
    const [submission] = dedupeKey
      ? await db.insert(leadSourceSubmissions).values(values)
          .onConflictDoUpdate({
            target: [
              leadSourceSubmissions.organizationId,
              leadSourceSubmissions.source,
              leadSourceSubmissions.externalId,
            ],
            set: {
              name: values.name,
              email: values.email,
              phone: values.phone,
              instagram: values.instagram,
              payload: values.payload,
              updatedAt: values.updatedAt,
            },
            // targetWhere (não setWhere): o índice único é parcial
            // (WHERE external_id IS NOT NULL), e o Postgres só consegue inferir
            // um índice parcial se o ON CONFLICT repetir o mesmo predicado.
            targetWhere: sql`${leadSourceSubmissions.externalId} IS NOT NULL`,
          })
          .returning({ id: leadSourceSubmissions.id, leadId: leadSourceSubmissions.leadId })
      : await db.insert(leadSourceSubmissions).values(values)
          .returning({ id: leadSourceSubmissions.id, leadId: leadSourceSubmissions.leadId })

    // Daqui pra baixo é best-effort: o log já está gravado, e é ele que não pode
    // se perder. Se o CRM engasgar (pipeline sem etapa, funil mal configurado), a
    // requisição ainda responde 201 — o outro lado não deve reenviar por isso.
    let leadId = submission?.leadId ?? null
    let leadCreated = false
    if (!leadId) {
      try {
        const lead = await upsertCrmLead(auth.organizationId, sourceDef.key, normalized)
        leadId = lead?.id ?? null
        leadCreated = lead?.created ?? false
        if (leadId && submission) {
          await db.update(leadSourceSubmissions)
            .set({ leadId })
            .where(eq(leadSourceSubmissions.id, submission.id))
        }
      } catch (err) {
        console.error('[ingest] log gravado, mas falhou ao criar o lead no CRM:', err)
      }
    }

    // Funil de atendimento — só para lead novo. Sem isso, reenviar o mesmo lead
    // (o quiz que virou "done") dispararia a mensagem de boas-vindas de novo.
    if (leadId && leadCreated) {
      try {
        await startFunnelForSource(auth.organizationId, sourceDef.key, leadId)
      } catch (err) {
        console.error('[ingest] lead criado, mas falhou ao iniciar o funil:', err)
      }
    }

    return Response.json(
      {
        data: {
          id: submission?.id ?? null,
          source: sourceDef.key,
          external_id: dedupeKey,
          lead_id: leadId,
          lead_created: leadCreated,
        },
      },
      { status: 201 }
    )
  } catch (err: any) {
    // Erro com `status` veio de authenticate() e a mensagem é pra quem chamou
    // ("token inválido"). Sem `status` é falha nossa (banco fora, bug) — aí loga
    // o motivo real e responde genérico: este endpoint é chamado por um sistema
    // externo, que não tem por que receber string de conexão ou stack trace.
    if (err?.status) return apiError(err.status, err.message)
    console.error('[ingest] erro inesperado:', err)
    return apiError(500, 'Erro interno ao registrar o lead.')
  }
}

/** Teste de credencial — quem configura o envio confere a chave antes. */
export async function handleIngestPing(req: NextRequest, sourceFromPath?: string) {
  try {
    const auth = await authenticate(req)
    if (sourceFromPath && !getLeadSource(sourceFromPath)) {
      return apiError(404, `Fonte desconhecida: "${sourceFromPath}". Válidas: ${LEAD_SOURCE_ORDER.join(', ')}.`)
    }
    return Response.json({
      data: {
        ok: true,
        organization_id: auth.organizationId,
        source: sourceFromPath ?? null,
        sources: LEAD_SOURCE_ORDER,
      },
    })
  } catch (err: any) {
    if (err?.status) return apiError(err.status, err.message)
    console.error('[ingest] erro inesperado no ping:', err)
    return apiError(500, 'Erro interno.')
  }
}
