import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { integrations } from '@/lib/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { processZapiMessage, logZapiDiagnostico } from '@/lib/zapiInbound'
import { ZAPI_INTEGRATION_TYPE } from '@/lib/zapi'

/**
 * Webhook único da Z-API.
 *
 * A Z-API tem um webhook por evento (mensagem recebida, status da mensagem,
 * conectado, desconectado), mas todos podem apontar pro mesmo endereço — é o que
 * `update-every-webhooks` faz. Ter uma URL só evita o erro clássico de configurar
 * três e esquecer justamente o de mensagem recebida; a separação acontece aqui,
 * pelo campo `type` do corpo.
 *
 * A organização vai na query (`?org_id=`), igual ao webhook da Evolution: a Z-API
 * não tem como carregar isso no payload, e o CRM é multiorganização.
 */

/** Callbacks que existem e não são conteúdo — reconhecidos pra não virar diagnóstico. */
const CALLBACKS_SEM_CONTEUDO = new Set([
  'MessageStatusCallback',
  'DeliveryCallback',
  'ReadCallback',
  'PresenceChatCallback',
])

export async function POST(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get('org_id')
    if (!orgId) return NextResponse.json({ ok: false, error: 'org_id ausente' }, { status: 400 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'corpo inválido' }, { status: 400 })
    }

    // Conectou / desconectou: reflete no status da integração, que é o que a tela
    // de configuração mostra. Sem isto, uma instância caída só apareceria como
    // "mensagens pararam de chegar", sem ninguém saber por quê.
    if (body.type === 'ConnectedCallback' || body.connected === true) {
      await marcarStatus(orgId, 'active')
      return NextResponse.json({ ok: true, evento: 'conectado' })
    }
    if (body.type === 'DisconnectedCallback' || body.disconnected === true) {
      await marcarStatus(orgId, 'disabled')
      return NextResponse.json({ ok: true, evento: 'desconectado' })
    }

    if (typeof body.type === 'string' && CALLBACKS_SEM_CONTEUDO.has(body.type)) {
      return NextResponse.json({ ok: true, skipped: body.type })
    }

    // Mensagem recebida (ou eco de mensagem enviada pelo celular).
    if (body.type === 'ReceivedCallback' || body.phone) {
      const resultado = await processZapiMessage(orgId, body)
      if (resultado.status === 'created') {
        return NextResponse.json({ ok: true, activityId: resultado.activityId })
      }
      return NextResponse.json({ ok: true, skipped: resultado.reason })
    }

    // Chegou algo que não sabemos ler: registra o payload em vez de descartar em
    // silêncio. Foi assim que os formatos desconhecidos da Evolution apareceram.
    await logZapiDiagnostico('evento_desconhecido', orgId, body)
    return NextResponse.json({ ok: true, skipped: 'evento desconhecido' })
  } catch (err: any) {
    console.error('[zapi webhook]', err)
    // 500 faz a Z-API reenviar, e o processamento é idempotente (dedupe por
    // messageId), então repetir é seguro e melhor que perder a mensagem.
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// 'disabled' é o valor que o enum de status da tabela usa pra "não está valendo".
async function marcarStatus(orgId: string, status: 'active' | 'disabled') {
  try {
    await db
      .update(integrations)
      .set({ status, updatedAt: new Date() })
      .where(and(
        eq(integrations.organizationId, orgId),
        eq(integrations.type, ZAPI_INTEGRATION_TYPE),
        isNull(integrations.deletedAt)
      ))
  } catch (err) {
    console.error('[zapi webhook] falha ao atualizar status da integração', err)
  }
}

/** A Z-API valida a URL com um GET antes de salvar o webhook. */
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Webhook Z-API ativo' })
}
