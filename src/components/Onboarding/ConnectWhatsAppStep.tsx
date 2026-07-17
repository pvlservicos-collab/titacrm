'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, ArrowClockwise } from '@phosphor-icons/react'
import WhatsAppCloudApiForm from '@/components/Settings/WhatsAppCloudApiForm'
import Button from '@/components/Shared/Button'
import { useAuth } from '@/hooks'

// Passos reais no Meta Business Manager pra chegar em WABA ID / Phone Number ID /
// System Token — substitui o genérico "cole a URL de webhook", que não corresponde a
// nenhum canal real (o webhook do WhatsApp Cloud API é um endpoint único da
// plataforma, configurado uma vez só pelo dono da plataforma, nunca pelo cliente).
const TUTORIAL_STEPS = [
    {
        title: 'Confirme sua Business Manager',
        description:
            'Acesse business.facebook.com (Meta Business Suite) e confirme que sua empresa já tem uma Business Manager Account — a verificação completa da empresa desbloqueia limites maiores de mensagem depois.',
    },
    {
        title: 'Crie um App na Meta for Developers',
        description: 'Em developers.facebook.com/apps, crie um App do tipo "Negócios", vinculado à sua Business Manager.',
    },
    {
        title: 'Adicione o produto WhatsApp',
        description: 'Dentro do App, em "Adicionar produto", adicione o WhatsApp e siga o assistente de configuração.',
    },
    {
        title: 'Copie o WABA ID',
        description:
            'No Meta Business Suite: Configurações → Contas → Contas do WhatsApp → selecione sua conta → copie o "ID da conta" (15-16 dígitos).',
    },
    {
        title: 'Copie o Phone Number ID',
        description:
            'Dentro do App, em WhatsApp → Configuração da API, selecione ou adicione seu número comercial — o painel mostra o "Phone number ID" ao lado dele (diferente do número em si).',
    },
    {
        title: 'Gere um System User Token permanente',
        description:
            'Configurações do Negócio → Usuários → Usuários do sistema → Adicionar → papel "Admin" → atribua o App e a WABA com acesso total → gere um token com escopos whatsapp_business_messaging e whatsapp_business_management, expiração "Nunca".',
    },
] as const

interface ConnectWhatsAppStepProps {
    connected: boolean
    onConnected: () => void
    onStep2Done?: () => void
}

export default function ConnectWhatsAppStep({ connected, onConnected, onStep2Done }: ConnectWhatsAppStepProps) {
    const { organizationId } = useAuth()
    const [hasInboundMessage, setHasInboundMessage] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

    const checkStatus = useCallback(async () => {
        if (!organizationId) return
        try {
            const res = await fetch(`/api/integrations/whatsapp-cloud?organization_id=${organizationId}`)
            const data = await res.json()
            if (data?.hasInboundMessage) setHasInboundMessage(true)
        } catch { }
    }, [organizationId])

    useEffect(() => {
        if (!connected || hasInboundMessage) return
        checkStatus()
        const interval = setInterval(checkStatus, 8000)
        return () => clearInterval(interval)
    }, [connected, hasInboundMessage, checkStatus])

    useEffect(() => {
        if (hasInboundMessage || testResult?.ok) onStep2Done?.()
    }, [hasInboundMessage, testResult, onStep2Done])

    const handleTest = async () => {
        setTesting(true)
        setTestResult(null)
        try {
            const res = await fetch('/api/integrations/whatsapp-cloud/test')
            const data = await res.json()
            setTestResult(data)
        } catch {
            setTestResult({ ok: false, error: 'Não foi possível testar agora.' })
        } finally {
            setTesting(false)
        }
    }

    const step2Done = hasInboundMessage || testResult?.ok === true

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-lg font-semibold text-ink mb-2">Conecte seu WhatsApp</h2>
                <p className="text-sm text-muted max-w-2xl">
                    Você não precisa configurar nenhum webhook — isso já está pronto na nossa plataforma.
                    Só precisamos de 3 informações da sua conta oficial do WhatsApp na Meta.
                </p>
            </div>

            <ol className="space-y-3">
                {TUTORIAL_STEPS.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-panel-2 border border-line text-muted text-[11px] font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                        </span>
                        <span className="text-muted">
                            <span className="text-ink font-medium">{step.title}.</span> {step.description}
                        </span>
                    </li>
                ))}
            </ol>

            <WhatsAppCloudApiForm compact onConnected={onConnected} />

            {connected && (
                <div className="border-t border-line pt-6">
                    <h3 className="text-lg font-medium text-ink mb-3">Status da conexão</h3>
                    {step2Done ? (
                        <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm">
                            <CheckCircle size={18} weight="fill" />
                            Recebendo mensagens normalmente.
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <p className="text-sm text-muted flex-1">Aguardando a primeira mensagem chegar, ou teste agora.</p>
                            <Button variant="secondary" onClick={handleTest} disabled={testing}>
                                <ArrowClockwise size={16} className={testing ? 'animate-spin' : ''} />
                                {testing ? 'Testando...' : 'Testar conexão agora'}
                            </Button>
                        </div>
                    )}
                    {testResult && !testResult.ok && (
                        <p className="text-xs text-red-400 mt-2">{testResult.error}</p>
                    )}
                </div>
            )}
        </div>
    )
}
