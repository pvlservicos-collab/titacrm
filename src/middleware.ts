import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const publicPaths = [
    '/login', '/ativar-conta', '/api/auth', '/api/webhooks', '/api/funnels/tick', '/api/integrations/instagram/check-tokens',
    // Cron da Vercel não manda cookie de sessão nem Authorization (CRON_SECRET não está
    // configurado no projeto) — sem isso na lista, toda chamada do cron caía no redirect
    // de login e a reconciliação nunca rodou de verdade desde que foi criada (13/07).
    '/api/cron/evolution-reconcile',
    // Manifest/service worker/ícones do PWA: o navegador busca isso sem sessão
    // (checagem de instalabilidade), então não pode cair no redirect de login.
    '/manifest.webmanifest', '/sw.js', '/icons/',
    // Assets estáticos de public/ servidos na raiz (logos, fontes, imagens de fundo) —
    // o matcher abaixo só livra _next/static e afins, então sem isso qualquer imagem
    // usada numa tela sem sessão (ex: login) cairia no redirect também.
    '/logos/', '/fonts/', '/chat-bg.svg',
  ]
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))

  if (isPublic) return NextResponse.next()

  // Requisições com Bearer token (API externa, n8n, etc.) passam direto — auth é validada no handler
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return NextResponse.next()

  // NextAuth v5 usa "authjs.session-token" (v4 usava "next-auth.session-token")
  const sessionToken =
    req.cookies.get('__Secure-authjs.session-token') ??
    req.cookies.get('authjs.session-token') ??
    req.cookies.get('next-auth.session-token') ??
    req.cookies.get('__Secure-next-auth.session-token')

  // Sem sessão vai pro login. Ficou desativado durante a revisão visual do
  // redesign, com uma identidade "demo" sintetizada no cliente pra as telas não
  // renderizarem vazias. Isso saiu junto: em produção, o app servia dados falsos
  // (leads e conversas de exemplo) pra quem abrisse sem logar — indistinguíveis
  // dos reais na tela, o que é pior que uma tela vazia.
  if (!sessionToken) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'  ],
}
