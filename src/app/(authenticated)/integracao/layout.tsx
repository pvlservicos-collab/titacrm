'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PlugsConnected, ChatCenteredText, Pulse } from '@phosphor-icons/react'

/**
 * Aba Integração: o que o PVL CRM faz como Tech Provider do WhatsApp.
 * Cada sub-aba corresponde a uma permissão pedida na análise da Meta:
 *  - Conectar WhatsApp  → business_management (Embedded Signup)
 *  - Modelos de mensagem → whatsapp_business_management (criar/listar templates)
 *  - Eventos             → webhooks recebidos da Meta (whatsapp_business_messaging)
 */
const ABAS = [
  { href: '/integracao', rotulo: 'Conectar WhatsApp', icone: PlugsConnected },
  { href: '/integracao/modelos', rotulo: 'Modelos de mensagem', icone: ChatCenteredText },
  { href: '/integracao/eventos', rotulo: 'Eventos da integração', icone: Pulse },
]

export default function IntegracaoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Integração WhatsApp</h1>
        <p className="text-sm text-muted mt-1">API Oficial da Meta — conta conectada, modelos de mensagem e eventos recebidos.</p>
      </div>
      <nav className="flex flex-wrap gap-2 mb-8 border-b border-line pb-3">
        {ABAS.map(({ href, rotulo, icone: Icone }) => {
          const ativa = href === '/integracao' ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                ativa ? 'bg-accent/10 border-accent/40 text-accent' : 'border-transparent text-muted hover:text-ink hover:bg-panel-2'
              }`}
            >
              <Icone size={16} weight={ativa ? 'fill' : 'regular'} />
              {rotulo}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
