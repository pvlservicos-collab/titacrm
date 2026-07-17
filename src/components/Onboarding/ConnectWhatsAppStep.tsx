'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, ArrowClockwise } from '@phosphor-icons/react'
import WhatsAppCloudApiForm from '@/components/Settings/WhatsAppCloudApiForm'
import Button from '@/components/Shared/Button'
import { useAuth } from '@/hooks'

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
        <div className="space-y-6">
            {/* ETAPA 01 — moldura azul */}
            <div className="border-2 border-accent-line rounded-2xl p-5 sm:p-7 bg-panel">
                <p className="text-[11px] font-bold text-accent-2 uppercase tracking-[0.3em] mb-1">Etapa 01</p>
                <h2 className="text-3xl font-bold text-ink tracking-tight mb-1">Conectar WhatsApp</h2>
                <p className="text-sm text-muted mb-6">API Oficial da Meta. Sem webhook manual — já vem pronto abaixo.</p>

                <WhatsAppCloudApiForm compact onConnected={onConnected} />
            </div>

            {/* ETAPA 02 — moldura verde, só aparece depois de salvar as credenciais */}
            {connected && (
                <div className={`border-2 rounded-2xl p-5 sm:p-7 ${step2Done ? 'border-emerald-500/40' : 'border-line'} bg-panel`}>
                    <p className={`text-[11px] font-bold uppercase tracking-[0.3em] mb-1 ${step2Done ? 'text-emerald-400' : 'text-muted'}`}>Etapa 02</p>
                    <h2 className="text-3xl font-bold text-ink tracking-tight mb-4">Confirmar conexão</h2>

                    {step2Done ? (
                        <div className="flex items-center gap-2.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3">
                            <CheckCircle size={22} weight="fill" />
                            <span className="font-semibold">Conectado — recebendo mensagens.</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2.5 text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                                <XCircle size={22} weight="fill" />
                                <span className="font-semibold">Ainda não conectado.</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <p className="text-sm text-muted flex-1">Aguardando a 1ª mensagem, ou teste agora.</p>
                                <Button variant="secondary" onClick={handleTest} disabled={testing}>
                                    <ArrowClockwise size={16} className={testing ? 'animate-spin' : ''} />
                                    {testing ? 'Testando...' : 'Testar conexão'}
                                </Button>
                            </div>
                            {testResult && !testResult.ok && (
                                <p className="text-xs text-red-400">{testResult.error}</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
