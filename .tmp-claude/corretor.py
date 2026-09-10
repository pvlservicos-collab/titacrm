# -*- coding: utf-8 -*-
import io

p = 'src/lib/zapi.ts'
s = io.open(p, encoding='utf-8').read()

s = s.replace(
    u"import { eq, and, isNull } from 'drizzle-orm'",
    u"import { eq, and, isNull } from 'drizzle-orm'\nimport { telefoneVariantes } from './leadSources'", 1)

old = u"""/** Telefone como a Z-API espera: só dígitos, com DDI. Grupo usa o id do grupo. */
function destinatario(phone: string): string {
  return phone.replace(/\\D/g, '')
}"""
new = u"""/** Telefone como a Z-API espera: só dígitos, com DDI. Grupo usa o id do grupo. */
function destinatario(phone: string): string {
  return phone.replace(/\\D/g, '')
}

/** Resultado de um envio: o que a Z-API devolveu e o número que funcionou. */
export interface EnvioZapi {
  data: any
  /** A forma do número que a Z-API aceitou — pode diferir da que foi pedida. */
  telefone: string
}

/**
 * Tenta enviar por cada forma do número até uma funcionar.
 *
 * O mesmo celular brasileiro existe com e sem o nono dígito, e qual das duas o
 * WhatsApp aceita depende da idade da conta — não dá pra saber de fora. O
 * endpoint `/phone-exists` da Z-API resolveria isso ANTES de enviar, mas nesta
 * instância ele responde "Whatsapp is not responding" mesmo com a sessão
 * conectada (testado duas vezes), então descobrir tentando é o caminho que sobra.
 *
 * Só tenta a segunda forma quando a primeira FALHA de verdade (a chamada
 * lançou), nunca quando ela deu 2xx — senão a pessoa receberia a mesma mensagem
 * duas vezes. Falhando todas, propaga o erro da primeira, que é o da forma
 * canônica e o mais informativo pra quem for investigar.
 */
async function comCorrecaoDeNumero(
  phone: string,
  enviar: (numero: string) => Promise<any>
): Promise<EnvioZapi> {
  const formas = telefoneVariantes(phone)
  const tentativas = formas.length > 0 ? formas : [destinatario(phone)]

  let primeiroErro: unknown = null
  for (const numero of tentativas) {
    try {
      const data = await enviar(numero)
      return { data, telefone: numero }
    } catch (err) {
      if (primeiroErro === null) primeiroErro = err
      console.warn('[zapi] envio falhou para ' + numero + '; tentando a outra forma do número', err)
    }
  }
  throw primeiroErro ?? new Error('Falha ao enviar pela Z-API')
}"""
assert old in s
s = s.replace(old, new, 1)

old = u"""export async function sendZapiMessage(organizationId: string, phone: string, text: string) {
  const creds = await getZapiCredentials(organizationId)
  return chamar(
    creds,
    'send-text',
    { body: { phone: destinatario(phone), message: text } },
    'Falha ao enviar mensagem pela Z-API'
  )
}"""
new = u"""export async function sendZapiMessage(
  organizationId: string,
  phone: string,
  text: string
): Promise<EnvioZapi> {
  const creds = await getZapiCredentials(organizationId)
  return comCorrecaoDeNumero(phone, (numero) =>
    chamar(
      creds,
      'send-text',
      { body: { phone: destinatario(numero), message: text } },
      'Falha ao enviar mensagem pela Z-API'
    )
  )
}"""
assert old in s
s = s.replace(old, new, 1)

ini = s.index(u"export async function sendZapiMedia(")
fim = s.index(u"/** Extensão do arquivo, do nome ou da URL.")
novo_media = u"""export async function sendZapiMedia(
  organizationId: string,
  phone: string,
  mediaType: string,
  mediaUrl: string,
  caption?: string,
  fileName?: string
): Promise<EnvioZapi> {
  const creds = await getZapiCredentials(organizationId)

  return comCorrecaoDeNumero(phone, (numero) => {
    const to = destinatario(numero)

    if (mediaType === 'image' || mediaType === 'sticker') {
      return chamar(creds, 'send-image', {
        body: { phone: to, image: mediaUrl, ...(caption ? { caption } : {}) },
      }, 'Falha ao enviar imagem pela Z-API')
    }

    if (mediaType === 'video') {
      return chamar(creds, 'send-video', {
        body: { phone: to, video: mediaUrl, ...(caption ? { caption } : {}) },
      }, 'Falha ao enviar vídeo pela Z-API')
    }

    if (mediaType === 'audio') {
      return chamar(creds, 'send-audio', {
        body: { phone: to, audio: mediaUrl },
      }, 'Falha ao enviar áudio pela Z-API')
    }

    const extensao = extensaoDe(fileName, mediaUrl)
    return chamar(creds, 'send-document/' + extensao, {
      body: { phone: to, document: mediaUrl, fileName: fileName || ('arquivo.' + extensao) },
    }, 'Falha ao enviar documento pela Z-API')
  })
}

"""
s = s[:ini] + novo_media + s[fim:]
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('zapi.ts ok')

# ── adapter devolve o telefone corrigido ────────────────────────────────────
p = 'src/lib/channels/types.ts'
s = io.open(p, encoding='utf-8').read()
old = u"""export interface ChannelSendResult {
  externalId?: string
  raw?: any
}"""
new = u"""export interface ChannelSendResult {
  externalId?: string
  raw?: any
  /**
   * A forma do número que o canal REALMENTE aceitou, quando o canal sabe dizer.
   *
   * O mesmo celular brasileiro existe com e sem o nono dígito e só dá pra saber
   * qual funciona tentando; quem chama grava a que deu certo no lead, pra não
   * repetir a tentativa perdida em toda mensagem seguinte.
   */
  recipienteCorrigido?: string
}"""
assert old in s
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('types ok')

p = 'src/lib/channels/zapi.ts'
s = io.open(p, encoding='utf-8').read()
old = u"""  async sendText(organizationId, _integrationId, recipient, content) {
    const result = await sendZapiMessage(organizationId, recipient, content)
    return { externalId: result?.messageId || result?.id, raw: result }
  },

  async sendMedia(organizationId, _integrationId, recipient, mediaType, mediaUrl, caption, filename) {
    const result = await sendZapiMedia(organizationId, recipient, mediaType, mediaUrl, caption, filename)
    return { externalId: result?.messageId || result?.id, raw: result }
  },"""
new = u"""  async sendText(organizationId, _integrationId, recipient, content) {
    const { data, telefone } = await sendZapiMessage(organizationId, recipient, content)
    return { externalId: data?.messageId || data?.id, raw: data, recipienteCorrigido: telefone }
  },

  async sendMedia(organizationId, _integrationId, recipient, mediaType, mediaUrl, caption, filename) {
    const { data, telefone } = await sendZapiMedia(organizationId, recipient, mediaType, mediaUrl, caption, filename)
    return { externalId: data?.messageId || data?.id, raw: data, recipienteCorrigido: telefone }
  },"""
assert old in s
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('adapter ok')
