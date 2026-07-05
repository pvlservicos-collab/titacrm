'use client'

import Navbar from '@/components/Shared/Navbar'
import { FilterProvider } from '@/contexts/FilterContext'
import AuthGuard from '@/components/Auth/AuthGuard'
import InstallAppBanner from '@/components/Shared/InstallAppBanner'

/**
 * Layout for all authenticated pages (pipeline, chat, settings, etc.)
 * Wraps children with AuthGuard (redirects if not logged in) and Navbar.
 *
 * AuthProvider/NotificationProvider já vêm do root layout (src/app/layout.tsx),
 * que envolve toda a árvore — não remontar aqui evita fetches duplicados de
 * /api/users/me em toda navegação (o contexto interno era descartado mesmo,
 * já que useAuth()/useNotifications() resolvem pro provider mais próximo).
 *
 * LeadsProvider não fica mais aqui — só Pipeline e Chat usam a lista de leads,
 * então cada um tem seu próprio layout local (pipeline/layout.tsx, chat/layout.tsx,
 * chat-evolution/layout.tsx) que o monta. Páginas como Financeiro e Logística
 * deixam de pagar o custo de /api/leads?returnAll=true em toda navegação.
 */
export default function AuthenticatedLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <AuthGuard>
            <FilterProvider>
                <div className="flex flex-col h-[100dvh] bg-gray-50">
                    <Navbar />
                    {/* Espaço embaixo pra não ficar atrás da barra de navegação inferior fixa (celular) */}
                    <main className="flex-1 overflow-auto scrollbar-hide pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
                        {children}
                    </main>
                </div>
                <InstallAppBanner />
            </FilterProvider>
        </AuthGuard>
    )
}
