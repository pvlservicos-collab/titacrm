'use client'

import { Eye, EyeClosed, WhatsappLogo, CheckCircle, Info, Lightning, ShieldCheck } from '@phosphor-icons/react'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks'

type ConnectionState = 'loading' | 'connected' | 'disconnected'

interface WhatsAppCloudApiFormProps {
    onConnected?: () => void
    compact?: boolean
}

/**
 * Form de credenciais do WhatsApp Cloud API (WABA ID / Phone Number ID / System Token).
 * Extraído de settings/integrations/whatsapp-cloud-api pra ser reaproveitado também no
 * onboarding (Fase B) — mesma lógica, chrome mais compacto quando `compact` é true.
 */
export default function WhatsAppCloudApiForm({ onConnected, compact = false }: WhatsAppCloudApiFormProps) {
    const { organizationId } = useAuth()

    const [wabaId, setWabaId] = useState('')
    const [phoneNumberId, setPhoneNumberId] = useState('')
    const [systemToken, setSystemToken] = useState('')
    const [graphApiVersion, setGraphApiVersion] = useState('v21.0')

    const [showToken, setShowToken] = useState(false)
    const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saveSuccess, setSaveSuccess] = useState(false)

    useEffect(() => {
        if (!organizationId) return
        let cancelled = false

        const load = async () => {
            setConnectionState('loading')
            try {
                const res = await fetch(`/api/integrations/whatsapp-cloud?organization_id=${organizationId}`)
                const data = await res.json()
                if (cancelled) return

                if (data && data.config) {
                    setWabaId(data.config.waba_id ?? '')
                    setPhoneNumberId(data.config.phone_number_id ?? '')
                    setGraphApiVersion(data.config.graph_api_version ?? 'v21.0')
                    setConnectionState(data.status === 'active' ? 'connected' : 'disconnected')
                } else {
                    setConnectionState('disconnected')
                }
            } catch (err) {
                console.error('Failed to load WhatsApp Cloud integration', err)
                if (!cancelled) setConnectionState('disconnected')
            }
        }

        load()
        return () => { cancelled = true }
    }, [organizationId])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!organizationId) return

        setIsSaving(true)
        setSaveError(null)
        setSaveSuccess(false)

        try {
            const res = await fetch('/api/integrations/whatsapp-cloud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: organizationId,
                    waba_id: wabaId.trim(),
                    phone_number_id: phoneNumberId.trim(),
                    system_token: systemToken,
                    graph_api_version: graphApiVersion.trim() || 'v21.0',
                }),
            })

            const data = await res.json()
            if (!res.ok) {
                setSaveError(data?.error || 'Erro ao salvar integração')
            } else {
                setSaveSuccess(true)
                setConnectionState('connected')
                setSystemToken('') // limpa da memória depois de salvar
                onConnected?.()
            }
        } catch (err: any) {
            setSaveError(err?.message ?? 'Erro ao salvar integração')
        } finally {
            setIsSaving(false)
        }
    }

    const statusBadge = connectionState === 'connected' ? (
        <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Conectado
        </span>
    ) : connectionState === 'loading' ? (
        <span className="flex items-center gap-1.5 text-muted bg-panel-2 px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse"></div> Verificando...
        </span>
    ) : (
        <span className="flex items-center gap-1.5 text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div> Desconectado
        </span>
    )

    const formDisabled = !organizationId || isSaving

    return (
        <div>
            {!compact && (
                <div className="flex items-center flex-wrap gap-3 justify-between mb-6">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted uppercase tracking-wider">
                        Status: {statusBadge}
                    </div>
                </div>
            )}

            <div className="bg-gradient-to-r from-panel-2 to-panel border border-line rounded-xl p-6 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <WhatsappLogo size={28} weight="fill" className="text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="font-bold text-ink flex items-center gap-2 text-lg">
                            WhatsApp Cloud API Oficial
                            <span className="bg-emerald-500 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider">Meta</span>
                        </h2>
                        <p className="text-sm text-muted mt-1">Conexão oficial pela nuvem da Meta. Ideal para templates HSM e disparos em escala.</p>
                    </div>
                </div>
                {compact && <div className="flex-shrink-0">{statusBadge}</div>}
            </div>

            <form onSubmit={handleSubmit} className="bg-panel border border-line rounded-xl p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-panel-2 flex items-center justify-center text-accent-2">
                        <Lightning size={18} weight="fill" className="rotate-45" />
                    </div>
                    <h3 className="font-bold text-ink text-lg">Credenciais do Meta Cloud API</h3>
                </div>

                <div className="space-y-5">
                    <div>
                        <label htmlFor="waba_id" className="block text-sm font-semibold text-ink mb-2">
                            WABA ID (WhatsApp Business Account)
                        </label>
                        <input
                            id="waba_id"
                            type="text"
                            value={wabaId}
                            onChange={(e) => setWabaId(e.target.value)}
                            placeholder="Ex: 10928374650123"
                            disabled={formDisabled}
                            className="w-full bg-panel-2 border border-line rounded-lg px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:opacity-50"
                            required
                        />
                        <p className="text-xs text-muted mt-1.5">Encontre no Meta Business Suite &gt; Configurações &gt; Contas do WhatsApp.</p>
                    </div>

                    <div>
                        <label htmlFor="phone_number_id" className="block text-sm font-semibold text-ink mb-2">
                            Phone Number ID
                        </label>
                        <input
                            id="phone_number_id"
                            type="text"
                            value={phoneNumberId}
                            onChange={(e) => setPhoneNumberId(e.target.value)}
                            placeholder="Ex: 5523478901234567"
                            disabled={formDisabled}
                            className="w-full bg-panel-2 border border-line rounded-lg px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:opacity-50"
                            required
                        />
                        <p className="text-xs text-muted mt-1.5">ID do número registrado na sua WABA (diferente do número em si).</p>
                    </div>

                    <div>
                        <label htmlFor="system_token" className="block text-sm font-semibold text-ink mb-2">
                            System User Token (Permanente)
                        </label>
                        <div className="relative">
                            <input
                                id="system_token"
                                type={showToken ? 'text' : 'password'}
                                value={systemToken}
                                onChange={(e) => setSystemToken(e.target.value)}
                                placeholder={connectionState === 'connected' ? '•••••••••••••• (deixe em branco para manter o atual)' : 'EAAW...'}
                                disabled={formDisabled}
                                className="w-full bg-panel-2 border border-line rounded-lg px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all pr-10 disabled:opacity-50"
                                required={connectionState !== 'connected'}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                                tabIndex={-1}
                            >
                                {showToken ? <EyeClosed size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <p className="text-xs text-muted mt-1.5 flex items-center gap-1">
                            <ShieldCheck size={12} weight="fill" className="text-accent-2" />
                            Guardado no banco de dados da plataforma; nunca é reexibido pelo backend.
                        </p>
                    </div>

                    {!compact && (
                        <div>
                            <label htmlFor="graph_api_version" className="block text-sm font-semibold text-ink mb-2">
                                Versão da Graph API
                            </label>
                            <input
                                id="graph_api_version"
                                type="text"
                                value={graphApiVersion}
                                onChange={(e) => setGraphApiVersion(e.target.value)}
                                placeholder="v21.0"
                                disabled={formDisabled}
                                className="w-full bg-panel-2 border border-line rounded-lg px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:opacity-50"
                            />
                            <p className="text-xs text-muted mt-1.5">Default: v21.0. Altere apenas se a Meta exigir versão específica.</p>
                        </div>
                    )}
                </div>

                {saveError && (
                    <div className="mt-6 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 flex items-start gap-2">
                        <Info size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
                        <span>{saveError}</span>
                    </div>
                )}

                {saveSuccess && (
                    <div className="mt-6 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm rounded-lg p-3 flex items-start gap-2">
                        <CheckCircle size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
                        <span>Integração salva com sucesso.</span>
                    </div>
                )}

                <div className="mt-8">
                    <button
                        type="submit"
                        disabled={formDisabled}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#4f8bff] to-[#2f6bf0] disabled:opacity-50 text-white font-medium py-3 rounded-lg shadow-sm transition-all hover:shadow-glow"
                    >
                        <Lightning size={16} weight="fill" />
                        {isSaving ? 'Salvando...' : connectionState === 'connected' ? 'Atualizar Credenciais' : 'Conectar via API Oficial'}
                    </button>
                </div>
            </form>
        </div>
    )
}
