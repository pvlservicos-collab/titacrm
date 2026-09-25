/**
 * As "linhas" da Evolution: um número por integração (Michele, Augusto, Cau).
 *
 * São só pra OBSERVAR e RESPONDER À MÃO pelo CRM — nada automático sai por
 * elas (ver CLAUDE.md). Este arquivo só cuida da conexão: estado, criar a
 * instância, registrar o webhook e gerar o QR Code.
 */
import { getEvolutionCredentials } from '@/lib/evolution'

export type EstadoDaLinha = 'conectado' | 'conectando' | 'desconectado' | 'nao_criada' | 'erro'

export interface SituacaoDaLinha {
  estado: EstadoDaLinha
  /** Número do WhatsApp conectado (só dígitos), quando a Evolution informa. */
  numero?: string
  nomeNoWhatsapp?: string
  erro?: string
}

function baseDoCrm() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')
  return 'https://titacrm.vercel.app'
}

async function chamar(server: string, apiKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${server}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: apiKey, ...((init.headers as Record<string, string>) || {}) },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

export async function situacaoDaLinha(organizationId: string, integrationId: string): Promise<SituacaoDaLinha> {
  try {
    const { instanceName, apiKey, server } = await getEvolutionCredentials(organizationId, integrationId)
    const r = await chamar(server, apiKey, `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`)
    if (r.status === 404) return { estado: 'nao_criada' }
    if (!r.ok) return { estado: 'erro', erro: `Evolution respondeu HTTP ${r.status}.` }
    const inst = Array.isArray(r.data) ? r.data[0] : r.data
    if (!inst) return { estado: 'nao_criada' }
    const status: string = inst.connectionStatus || inst.instance?.state || 'close'
    const numero = (inst.number || inst.ownerJid || '').toString().split('@')[0].replace(/\D/g, '') || undefined
    const nomeNoWhatsapp = inst.profileName || undefined
    if (status === 'open') return { estado: 'conectado', numero, nomeNoWhatsapp }
    if (status === 'connecting') return { estado: 'conectando' }
    return { estado: 'desconectado' }
  } catch (err: any) {
    return { estado: 'erro', erro: err?.message || 'Não consegui falar com a Evolution.' }
  }
}

/**
 * Garante a instância (cria se não existir), aponta o webhook pro CRM e devolve
 * o QR Code pra escanear. Já conectada: só devolve o estado.
 *
 * `syncFullHistory` fica ligado na criação porque o WhatsApp só manda o histórico
 * de conversas na hora de parear o aparelho — depois não dá mais. Guardar o
 * histórico na Evolution não manda nada pra ninguém.
 */
export async function conectarLinha(organizationId: string, integrationId: string) {
  const { instanceName, apiKey, server } = await getEvolutionCredentials(organizationId, integrationId)

  const atual = await situacaoDaLinha(organizationId, integrationId)
  if (atual.estado === 'conectado') return { ...atual }
  if (atual.estado === 'erro') return { ...atual }

  if (atual.estado === 'nao_criada') {
    const criada = await chamar(server, apiKey, '/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        rejectCall: false,
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: true,
      }),
    })
    if (!criada.ok && criada.status !== 201) {
      return { estado: 'erro' as const, erro: `Falha ao criar a instância: ${JSON.stringify(criada.data).slice(0, 200)}` }
    }
  }

  await chamar(server, apiKey, `/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: `${baseDoCrm()}/api/webhooks/evolution?org_id=${organizationId}`,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'SEND_MESSAGE', 'CONNECTION_UPDATE'],
      },
    }),
  })

  const qr = await chamar(server, apiKey, `/instance/connect/${encodeURIComponent(instanceName)}`)
  if (!qr.ok) return { estado: 'erro' as const, erro: `Falha ao gerar o QR Code: ${JSON.stringify(qr.data).slice(0, 200)}` }
  const bruto: string | undefined = qr.data?.base64 || qr.data?.qrcode?.base64
  const qrCode = bruto ? (bruto.startsWith('data:') ? bruto : `data:image/png;base64,${bruto}`) : undefined
  return { estado: 'desconectado' as const, qrCode, codigoDePareamento: qr.data?.pairingCode || undefined }
}
