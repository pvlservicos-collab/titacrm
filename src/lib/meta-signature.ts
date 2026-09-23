import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Assinatura dos webhooks da Meta (WhatsApp Cloud, Instagram, Messenger).
 *
 * Cada POST traz `X-Hub-Signature-256: sha256=<hex>`, o HMAC-SHA256 do corpo CRU
 * com o App Secret do app. Tem que ser o corpo cru: parsear e reserializar o
 * JSON muda bytes (espaços, ordem, escapes unicode) e a conferência falha.
 *
 * `FACEBOOK_APP_SECRET` aceita mais de um segredo separado por vírgula — o
 * Instagram com login próprio usa um app diferente do WhatsApp, e cada um assina
 * com o seu. Basta um bater.
 */

export type ResultadoAssinatura = 'valida' | 'invalida' | 'sem-segredo'

export function segredosDoApp(env: string | undefined = process.env.FACEBOOK_APP_SECRET): string[] {
  return (env ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function conferirAssinatura(
  corpoCru: string,
  cabecalho: string | null,
  segredos: string[] = segredosDoApp()
): ResultadoAssinatura {
  // Sem segredo configurado não dá pra conferir nada — quem chama decide o que
  // fazer (hoje: aceita e avisa no log, pra não derrubar o webhook no deploy).
  if (segredos.length === 0) return 'sem-segredo'

  const recebida = cabecalho?.startsWith('sha256=') ? cabecalho.slice('sha256='.length) : ''
  if (!/^[0-9a-f]{64}$/i.test(recebida)) return 'invalida'
  const recebidaBuf = Buffer.from(recebida, 'hex')

  for (const segredo of segredos) {
    const esperada = createHmac('sha256', segredo).update(corpoCru, 'utf8').digest()
    // Comparação de tempo constante; os dois buffers têm 32 bytes (checado acima).
    if (timingSafeEqual(esperada, recebidaBuf)) return 'valida'
  }
  return 'invalida'
}

/** Gera o cabeçalho que a Meta mandaria — usado só no teste e no curl de exemplo. */
export function assinar(corpoCru: string, segredo: string): string {
  return 'sha256=' + createHmac('sha256', segredo).update(corpoCru, 'utf8').digest('hex')
}
