'use client'

import { useState } from 'react'
import { RocketLaunch } from '@phosphor-icons/react'
import { useAuth } from '@/hooks'
import { useRouter } from 'next/navigation'
import Button from '@/components/Shared/Button'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'
import ConnectWhatsAppStep from '@/components/Onboarding/ConnectWhatsAppStep'
import OptionalSetupStep from '@/components/Onboarding/OptionalSetupStep'
import FeatureOverviewGrid from '@/components/Onboarding/FeatureOverviewGrid'

/**
 * Início — página normal (não travada, sem etapas obrigatórias), sempre acessível
 * pela Navbar. Quem quiser pode ir direto pro Pipeline/Chat a qualquer momento.
 */
export default function InicioPage() {
    const router = useRouter()
    const { profileName, user, loading } = useAuth()
    const [connected, setConnected] = useState(false)

    const firstName = (profileName || user?.email || '').split(' ')[0] || ''

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-56px)]">
                <LoadingSpinner text="Carregando..." size="lg" />
            </div>
        )
    }

    return (
        <div className="min-h-full bg-void relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(61,123,255,0.12)_0%,transparent_70%)]" />
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(91,155,255,0.08)_0%,transparent_70%)]" />
            </div>

            <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-panel-2 border border-accent-line mb-6 shadow-glow">
                        <RocketLaunch size={26} weight="fill" className="text-accent-2" />
                    </div>
                    <p className="text-[11px] font-bold text-accent-2 uppercase tracking-[0.32em] mb-3">
                        {firstName ? `Olá, ${firstName}` : 'Bem-vindo'}
                    </p>
                    <h1 className="text-3xl sm:text-4xl font-light text-ink tracking-tight mb-3">Vamos decolar.</h1>
                    <p className="text-muted max-w-lg mx-auto">
                        Conecte seu WhatsApp e explore as funções do Follem por aqui, sempre que precisar.
                    </p>
                </div>

                <div className="bg-panel border border-line rounded-2xl p-6 sm:p-10 mb-12">
                    <ConnectWhatsAppStep connected={connected} onConnected={() => setConnected(true)} />
                    <div className="mt-8">
                        <OptionalSetupStep onNavigate={(href) => router.push(href)} />
                    </div>
                </div>

                <div className="mb-4">
                    <p className="text-[11px] font-bold text-muted uppercase tracking-[0.3em] mb-4 text-center">
                        O que você vai encontrar por aqui
                    </p>
                    <FeatureOverviewGrid />
                </div>

                <div className="flex flex-col items-center gap-3 pt-8">
                    <Button href="/chat" variant="primary" showArrow>Ir para o chat</Button>
                </div>
            </div>
        </div>
    )
}
