/**
 * Configuração da integração Z-API.
 *
 * GET    — estado atual (sem devolver segredo nenhum) + status da instância.
 * POST   — grava/atualiza credenciais.
 * PUT    — ações na instância: `qrcode`, `webhooks`, `desconectar`.
 * DELETE — desliga a integração.
 *
 * Os segredos (token da instância e Client-Token) vão pra `integration_secrets`,
 * NUNCA pra `integrations.config`: a rota genérica /api/integrations devolve o
 * config inteiro pro navegador, então uma credencial ali vazaria pra qualquer
 * membro que abrisse a tela de integrações. O instance_id fica no config porque
 * é identificador, aparece na tela e não abre porta sozinho.
 */
import { NextRequest } from 'next/server'
import { authenticateRequest, apiError, validateRequired } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { integrations, integrationSecrets, organizationRoles } from '@/lib/schema'
import { eq, and, isNull } from 'drizzle-orm'
import {
  ZAPI_INTEGRATION_TYPE,
  ZAPI_INTEGRATION_NAME,
  fetchZapiStatus,
  fetchZapiQrCode,
  updateZapiWebhooks,
  disconnectZapi,
} from '@/lib/zapi'

async function assertManageIntegrations(auth: Awaited<ReturnType<typeof authenticateRequest>>) {
  if (auth.isSuperAdmin || !auth.memberId || !auth.roleId) return
  const [role] = await db.select({ permissions: organizationRoles.permissions })
    .from(organizationRoles).where(eq(organizationRoles.id, auth.roleId)).limit(1)
  if (!role) throw { status: 403, message: 'Não foi possível validar permissões.' }
  const perms = (role.permissions || {}) as Record<string, any>
  if (!perms.manage_integrations && !perms['*'] && !perms.all) {
    throw { status: 403, message: 'Permissão negada: requer manage_integrations.' }
  }
}

async function buscarIntegracao(organizationId: string) {
  const [integration] = await db
    .select({ id: integrations.id, status: integrations.status, config: integrations.config })
    .from(integrations)
    .where(and(
      eq(integrations.organizationId, organizationId),
      eq(integrations.type, ZAPI_INTEGRATION_TYPE),
      isNull(integrations.deletedAt)
    ))
    .limit(1)
  return integration ?? null
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    const integration = await buscarIntegracao(auth.organizationId)
    if (!integration) return Response.json(null)

    const [secretRow] = await db
      .select({ secret: integrationSecrets.secret })
      .from(integrationSecrets)
      .where(eq(integrationSecrets.integrationId, integration.id))
      .limit(1)
    const secret = (secretRow?.secret ?? {}) as { instance_token?: string; client_token?: string }

    // Consulta a instância só quando as credenciais estão completas — sem isso a
    // tela mostraria "erro de conexão" pra quem ainda está preenchendo o formulário.
    let status: Awaited<ReturnType<typeof fetchZapiStatus>> | null = null
    let statusErro: string | null = null
    if (secret.instance_token) {
      try {
        status = await fetchZapiStatus(auth.organizationId)
      } catch (err: any) {
        statusErro = err?.message || 'Não foi possível consultar a instância.'
      }
    }

    return Response.json({
      id: integration.id,
      status: integration.status,
      instance_id: (integration.config as any)?.instance_id ?? null,
      // Só diz se existe; o valor nunca volta pro navegador.
      tem_instance_token: !!secret.instance_token,
      tem_client_token: !!secret.client_token,
      instancia: status,
      instancia_erro: statusErro,
    })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await assertManageIntegrations(auth)
    const body = await req.json().catch(() => ({}))
    // client_token fora da lista: só é exigido por contas com a trava de
    // segurança ligada no painel da Z-API (ver ZapiCredentials).
    const faltando = validateRequired(body ?? {}, ['instance_id', 'instance_token'])
    if (faltando) return apiError(400, faltando)

    const instanceId = String(body.instance_id).trim()
    const instanceToken = String(body.instance_token ?? '').trim()
    const clientToken = String(body.client_token ?? '').trim()

    const existente = await buscarIntegracao(auth.organizationId)
    let integrationId: string
    if (existente) {
      integrationId = existente.id
      await db.update(integrations)
        .set({ config: { instance_id: instanceId }, status: 'active', updatedAt: new Date() })
        .where(and(eq(integrations.id, integrationId), eq(integrations.organizationId, auth.organizationId)))
    } else {
      const [criada] = await db.insert(integrations).values({
        organizationId: auth.organizationId,
        name: ZAPI_INTEGRATION_NAME,
        type: ZAPI_INTEGRATION_TYPE,
        status: 'active',
        config: { instance_id: instanceId },
      }).returning({ id: integrations.id })
      integrationId = criada.id
    }

    const [segredo] = await db.select({ id: integrationSecrets.id })
      .from(integrationSecrets)
      .where(eq(integrationSecrets.integrationId, integrationId))
      .limit(1)

    // Campo em branco = "não mexi nesse", não "apague".
    // A tela limpa os campos de senha depois de salvar, então salvar de novo (só
    // pra trocar o ID, por exemplo) apagaria os tokens se isto sobrescrevesse cego.
    const [atual] = await db.select({ secret: integrationSecrets.secret })
      .from(integrationSecrets)
      .where(eq(integrationSecrets.integrationId, integrationId))
      .limit(1)
    const anterior = (atual?.secret ?? {}) as { instance_token?: string; client_token?: string }
    const novoSegredo = {
      instance_token: instanceToken || anterior.instance_token || '',
      client_token: clientToken || anterior.client_token || '',
    }
    if (!novoSegredo.instance_token) return apiError(400, 'Token da instância é obrigatório.')

    if (segredo) {
      await db.update(integrationSecrets)
        .set({ secret: novoSegredo, updatedAt: new Date() })
        .where(eq(integrationSecrets.integrationId, integrationId))
    } else {
      await db.insert(integrationSecrets).values({
        integrationId,
        organizationId: auth.organizationId,
        secret: novoSegredo,
      })
    }

    return Response.json({ integration_id: integrationId })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await assertManageIntegrations(auth)
    const body = await req.json().catch(() => ({}))
    const acao = String(body?.acao || '')

    if (acao === 'qrcode') {
      const valor = await fetchZapiQrCode(auth.organizationId)
      return Response.json({ qrcode: valor })
    }

    if (acao === 'webhooks') {
      const url = String(body?.url || '').trim()
      if (!url.startsWith('https://')) {
        return apiError(400, 'A Z-API só aceita webhook em https.')
      }
      const resultado = await updateZapiWebhooks(auth.organizationId, url)
      return Response.json({ ok: true, resultado })
    }

    if (acao === 'desconectar') {
      const resultado = await disconnectZapi(auth.organizationId)
      return Response.json({ ok: true, resultado })
    }

    return apiError(400, `Ação desconhecida: "${acao}". Use qrcode, webhooks ou desconectar.`)
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    await assertManageIntegrations(auth)
    const integration = await buscarIntegracao(auth.organizationId)
    if (!integration) return Response.json({ ok: true })

    // Desativa em vez de apagar: as conversas e atividades já gravadas apontam
    // pra esta integração, e apagá-la deixaria a timeline sem canal de origem.
    await db.update(integrations)
      .set({ status: 'disabled', deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(integrations.id, integration.id), eq(integrations.organizationId, auth.organizationId)))

    return Response.json({ ok: true })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
