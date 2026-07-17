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
 * Início — página normal (não travada), sempre acessível pela Navbar, no mesmo
 * padrão de header das outras telas do sistema (Financeiro, Logística etc).
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
        <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-10">
            {/* Header — mesmo padrão de Financeiro/Logística: ícone + título + subtítulo */}
            <div className="flex items-center gap-3 pb-6 border-b border-line">
                <RocketLaunch size={28} className="text-accent-2" weight="fill" />
                <div>
                    <h1 className="text-3xl font-bold text-ink">
                        {firstName ? `Bem-vindo, ${firstName}` : 'Bem-vindo'}
                    </h1>
                    <p className="text-sm text-muted">Configure essas etapas apenas uma vez e todas as funções ficarão disponíveis!</p>
                </div>
            </div>

            <div>
                <ConnectWhatsAppStep connected={connected} onConnected={() => setConnected(true)} />
                <div className="mt-8">
                    <OptionalSetupStep onNavigate={(href) => router.push(href)} />
                </div>
            </div>

            <div>
                <h2 className="text-lg font-semibold text-ink mb-4">O que você vai encontrar por aqui</h2>
                <FeatureOverviewGrid />
            </div>

            <div className="flex justify-start pb-4">
                <Button href="/chat" variant="primary" showArrow>Ir para o chat</Button>
            </div>
        </div>
    )
}
