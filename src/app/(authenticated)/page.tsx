'use client'

import { useAuth } from '@/hooks'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'
import BusinessFlowDiagram from '@/components/Dashboard/BusinessFlowDiagram'
import ChannelStatsSection from '@/components/Dashboard/ChannelStatsSection'
import LeadsByDayChart from '@/components/Dashboard/LeadsByDayChart'
import PurchaseMetricsSection from '@/components/Dashboard/PurchaseMetricsSection'
import FollowUpMetricsSection from '@/components/Dashboard/FollowUpMetricsSection'

export default function InicioPage() {
    const { profileName, user, loading } = useAuth()

    const firstName = (profileName || user?.email || '').split(' ')[0] || ''

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-56px)]">
                <LoadingSpinner text="Carregando..." size="lg" />
            </div>
        )
    }

    return (
        <div className="relative min-h-full">
            {/* Glow ambiente — reforça o clima "glass" atrás dos cards translúcidos */}
            <div className="pointer-events-none absolute -top-24 left-1/4 w-[520px] h-[520px] rounded-full bg-accent/10 blur-[120px]" />
            <div className="pointer-events-none absolute top-40 right-0 w-[420px] h-[420px] rounded-full bg-accent/[0.06] blur-[100px]" />

            <div className="relative max-w-6xl mx-auto p-4 sm:p-6 space-y-8">
                <div className="pb-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-ink">
                        {firstName ? `Olá, ${firstName}` : 'Olá'}
                    </h1>
                    <p className="text-sm text-muted mt-1">Visão geral do seu funil de aquisição e vendas.</p>
                </div>

                <BusinessFlowDiagram />
                <ChannelStatsSection />
                <LeadsByDayChart />
                <PurchaseMetricsSection />
                <FollowUpMetricsSection />
            </div>
        </div>
    )
}
