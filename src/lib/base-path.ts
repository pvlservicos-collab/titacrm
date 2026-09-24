/**
 * Prefixo do app, se ele não roda na raiz do domínio (ex.: '/crm').
 *
 * O Next só prefixa sozinho o que passa por <Link>, useRouter e redirect().
 * Os fetch('/api/...') do kit usam BASE_PATH na mão. Se o projeto roda na raiz
 * do domínio, deixe NEXT_PUBLIC_BASE_PATH vazio (padrão) e nada muda.
 * Se usar basePath no next.config, coloque o mesmo valor aqui.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

/** Prefixa um caminho interno ('/chat' -> '/crm/chat'). Idempotente. */
export function comBase(caminho: string): string {
  if (!BASE_PATH || !caminho.startsWith('/') || caminho.startsWith('//')) return caminho
  if (caminho === BASE_PATH || caminho.startsWith(BASE_PATH + '/') || caminho.startsWith(BASE_PATH + '?')) return caminho
  return BASE_PATH + caminho
}
