'use client'

import {
    ChatCircleDots,
    Kanban,
    FlowArrow,
    Truck,
    CurrencyDollar,
    ChartBar,
    Gear,
    Image as ImageIcon,
} from '@phosphor-icons/react'

const FEATURES = [
    {
        key: 'chat',
        label: 'Chat',
        icon: ChatCircleDots,
        description: 'Todas as conversas do WhatsApp e Instagram em um só lugar — responda, mande áudio, imagem e use respostas rápidas.',
    },
    {
        key: 'pipeline',
        label: 'Pipeline',
        icon: Kanban,
        description: 'Kanban visual: arraste os leads pelas etapas do seu funil de vendas.',
    },
    {
        key: 'funis',
        label: 'Funis',
        icon: FlowArrow,
        description: 'Automatize sequências de mensagem com blocos, sem escrever código.',
    },
    {
        key: 'logistica',
        label: 'Logística',
        icon: Truck,
        description: 'Acompanhe pedidos e entregas do início ao fim.',
    },
    {
        key: 'financeiro',
        label: 'Financeiro',
        icon: CurrencyDollar,
        description: 'Contas a pagar, despesas e o financeiro do dia a dia.',
    },
    {
        key: 'metricas',
        label: 'Métricas',
        icon: ChartBar,
        description: 'Desempenho por etapa e por período, pra decidir com dados.',
    },
    {
        key: 'configuracoes',
        label: 'Configurações',
        icon: Gear,
        description: 'Integrações, membros da equipe, produtos e etiquetas.',
    },
] as const

export default function FeatureOverviewGrid() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
                const Icon = f.icon
                return (
                    <div
                        key={f.key}
                        className="bg-panel border border-line rounded-2xl p-5 hover:border-accent-line transition-colors"
                    >
                        <div className="w-10 h-10 rounded-xl bg-panel-2 flex items-center justify-center text-accent-2 mb-4">
                            <Icon size={20} weight="fill" />
                        </div>
                        <h3 className="font-semibold text-ink mb-1.5">{f.label}</h3>
                        <p className="text-sm text-muted mb-4">{f.description}</p>
                        {/* TODO: print da função */}
                        <div className="border border-dashed border-line rounded-lg h-24 flex flex-col items-center justify-center gap-1.5 text-muted">
                            <ImageIcon size={18} />
                            <span className="text-[10px] uppercase tracking-wide">Adicionar print · {f.label}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
