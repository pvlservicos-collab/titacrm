'use client'

import { useEffect, useRef, useState } from 'react'
import {
    ChatCircleDots,
    Kanban,
    FlowArrow,
    Truck,
    CurrencyDollar,
    ChartBar,
    Gear,
    Image as ImageIcon,
    SpinnerGap,
} from '@phosphor-icons/react'
import { useAuth } from '@/hooks'
import { uploadClientFile } from '@/lib/blobClient'

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
    const { isMaster } = useAuth()
    const [screenshots, setScreenshots] = useState<Record<string, string>>({})
    const [uploadingKey, setUploadingKey] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const pendingKeyRef = useRef<string | null>(null)

    useEffect(() => {
        let cancelled = false
        fetch('/api/platform/feature-screenshots')
            .then((res) => res.json())
            .then((data) => { if (!cancelled) setScreenshots(data || {}) })
            .catch(() => { })
        return () => { cancelled = true }
    }, [])

    const triggerUpload = (featureKey: string) => {
        pendingKeyRef.current = featureKey
        fileInputRef.current?.click()
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        const featureKey = pendingKeyRef.current
        e.target.value = ''
        if (!file || !featureKey) return

        setUploadingKey(featureKey)
        try {
            const url = await uploadClientFile(file, 'feature-screenshots', featureKey)
            await fetch('/api/platform/feature-screenshots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feature_key: featureKey, image_url: url }),
            })
            setScreenshots((prev) => ({ ...prev, [featureKey]: url }))
        } catch (err) {
            console.error('Falha ao subir print da função', err)
        } finally {
            setUploadingKey(null)
        }
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isMaster && (
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            )}
            {FEATURES.map((f) => {
                const Icon = f.icon
                const imageUrl = screenshots[f.key]
                const isUploading = uploadingKey === f.key
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

                        {imageUrl ? (
                            <button
                                type="button"
                                onClick={isMaster ? () => triggerUpload(f.key) : undefined}
                                disabled={!isMaster}
                                className={`block w-full rounded-lg overflow-hidden border border-line relative ${isMaster ? 'cursor-pointer' : 'cursor-default'}`}
                                title={isMaster ? 'Trocar print' : undefined}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={imageUrl} alt={`Print de ${f.label}`} className="w-full h-24 object-cover" />
                                {isUploading && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                        <SpinnerGap size={20} className="animate-spin text-white" weight="bold" />
                                    </div>
                                )}
                            </button>
                        ) : isMaster ? (
                            <button
                                type="button"
                                onClick={() => triggerUpload(f.key)}
                                disabled={isUploading}
                                className="w-full border border-dashed border-accent-line rounded-lg h-24 flex flex-col items-center justify-center gap-1.5 text-accent-2 hover:bg-panel-2 transition-colors disabled:opacity-60"
                            >
                                {isUploading ? (
                                    <SpinnerGap size={18} className="animate-spin" weight="bold" />
                                ) : (
                                    <ImageIcon size={18} />
                                )}
                                <span className="text-[10px] uppercase tracking-wide">
                                    {isUploading ? 'Enviando...' : `Adicionar print · ${f.label}`}
                                </span>
                            </button>
                        ) : (
                            // TODO: print da função — só aparece o quadro pontilhado até o
                            // superadmin subir a imagem (ninguém mais tem essa opção).
                            <div className="border border-dashed border-line rounded-lg h-24 flex flex-col items-center justify-center gap-1.5 text-muted">
                                <ImageIcon size={18} />
                                <span className="text-[10px] uppercase tracking-wide">Em breve</span>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
