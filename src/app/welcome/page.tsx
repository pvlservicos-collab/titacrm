'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RocketLaunch } from '@phosphor-icons/react'
import AuthGuard from '@/components/Auth/AuthGuard'
import { useAuth } from '@/hooks'
import Button from '@/components/Shared/Button'
import OnboardingStepper from '@/components/Onboarding/OnboardingStepper'
import ConnectWhatsAppStep from '@/components/Onboarding/ConnectWhatsAppStep'
import OptionalSetupStep from '@/components/Onboarding/OptionalSetupStep'
import FeatureOverviewGrid from '@/components/Onboarding/FeatureOverviewGrid'

const STEP_LABELS = ['Conectar', 'Confirmar', 'Funil']

export default function WelcomePage() {
    const router = useRouter()
    const { onboardingCompleted, onboardingStatusLoaded, profileName, user } = useAuth()
    const [connected, setConnected] = useState(false)
    const [step2Done, setStep2Done] = useState(false)
    const [finishing, setFinishing] = useState(false)

    // Quem já concluiu o onboarding não deve ver esse tour de novo — cobre navegação
    // direta pela URL (o OnboardingGate só protege as rotas dentro de (authenticated)).
    useEffect(() => {
        if (onboardingStatusLoaded && onboardingCompleted === true) {
            router.replace('/chat')
        }
    }, [onboardingStatusLoaded, onboardingCompleted, router])

    const markCompleteAndGo = async (destination: string) => {
        setFinishing(true)
        try {
            await fetch('/api/users/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ onboarding_completed: true }),
            })
        } finally {
            window.location.href = destination
        }
    }

    const firstName = (profileName || user?.email || '').split(' ')[0] || ''

    return (
        <AuthGuard>
            <div className="min-h-screen bg-void relative overflow-hidden">
                {/* Atmosfera: glows radiais azuis sutis, sem competir com o conteúdo */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                    <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(61,123,255,0.14)_0%,transparent_70%)]" />
                    <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(91,155,255,0.08)_0%,transparent_70%)]" />
                </div>

                <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                    {/* Boas-vindas */}
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-panel-2 border border-accent-line mb-6 shadow-glow">
                            <RocketLaunch size={26} weight="fill" className="text-accent-2" />
                        </div>
                        <p className="text-[11px] font-bold text-accent-2 uppercase tracking-[0.32em] mb-3">
                            Bem-vindo{firstName ? `, ${firstName}` : ''}
                        </p>
                        <h1 className="text-3xl sm:text-4xl font-light text-ink tracking-tight mb-3">Vamos decolar.</h1>
                        <p className="text-muted max-w-lg mx-auto">
                            Esse guia rápido aparece só agora, no seu primeiro acesso. Depois disso o app abre direto no chat.
                        </p>
                    </div>

                    {/* Indicador de progresso */}
                    <div className="mb-12">
                        <OnboardingStepper
                            steps={STEP_LABELS}
                            currentStep={!connected ? 0 : !step2Done ? 1 : 2}
                            completedSteps={[connected, step2Done, false]}
                        />
                    </div>

                    {/* Passo 1 + 2 + 3 (opcional) */}
                    <div className="bg-panel border border-line rounded-2xl p-6 sm:p-10 mb-12">
                        <ConnectWhatsAppStep
                            connected={connected}
                            onConnected={() => setConnected(true)}
                            onStep2Done={() => setStep2Done(true)}
                        />
                        <div className="mt-8">
                            <OptionalSetupStep onNavigate={(href) => markCompleteAndGo(href)} />
                        </div>
                    </div>

                    {/* Overview das funções */}
                    <div className="mb-12">
                        <p className="text-[11px] font-bold text-muted uppercase tracking-[0.3em] mb-4 text-center">
                            O que você vai encontrar por aqui
                        </p>
                        <FeatureOverviewGrid />
                    </div>

                    {/* CTA final */}
                    <div className="flex flex-col items-center gap-3">
                        <Button variant="primary" showArrow disabled={finishing} onClick={() => markCompleteAndGo('/chat')}>
                            {finishing ? 'Só um instante...' : 'Concluir e ir para o chat'}
                        </Button>
                        {!connected && (
                            <p className="text-xs text-muted">Você pode conectar o WhatsApp depois, em Configurações → Integrações.</p>
                        )}
                    </div>
                </div>
            </div>
        </AuthGuard>
    )
}
