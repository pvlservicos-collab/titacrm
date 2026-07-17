'use client'

import { Kanban, UsersThree } from '@phosphor-icons/react'

interface OptionalSetupStepProps {
    onNavigate: (href: string) => void
}

export default function OptionalSetupStep({ onNavigate }: OptionalSetupStepProps) {
    return (
        <div className="border-t border-line pt-8">
            <p className="text-[11px] font-bold text-muted uppercase tracking-[0.3em] mb-2">Passo 3 · opcional</p>
            <h3 className="text-lg font-medium text-ink mb-4">Prepare seu funil</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                    onClick={() => onNavigate('/settings/pipelines')}
                    className="flex items-center gap-3 bg-panel border border-line rounded-xl p-4 text-left hover:border-accent-line transition-colors"
                >
                    <div className="w-10 h-10 rounded-lg bg-panel-2 flex items-center justify-center text-accent-2 flex-shrink-0">
                        <Kanban size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-ink">Criar etapas do pipeline</p>
                        <p className="text-xs text-muted">Organize seu funil de vendas.</p>
                    </div>
                </button>
                <button
                    onClick={() => onNavigate('/settings/members')}
                    className="flex items-center gap-3 bg-panel border border-line rounded-xl p-4 text-left hover:border-accent-line transition-colors"
                >
                    <div className="w-10 h-10 rounded-lg bg-panel-2 flex items-center justify-center text-accent-2 flex-shrink-0">
                        <UsersThree size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-ink">Adicionar pessoas da equipe</p>
                        <p className="text-xs text-muted">Convide quem mais vai atender.</p>
                    </div>
                </button>
            </div>
        </div>
    )
}
