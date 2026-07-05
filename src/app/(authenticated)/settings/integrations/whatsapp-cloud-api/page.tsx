'use client'

import Link from 'next/link'
import { ArrowLeft, Eye, EyeClosed, WhatsappLogo, CheckCircle, Info, Lightning, CaretUp, CaretDown, BookOpen, ShieldCheck } from '@phosphor-icons/react'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks'

const FAQS = [
    {
        question: "Como obter minhas credenciais?",
        answer: "Crie um App no portal Meta for Developers, adicione o produto WhatsApp, configure um número oficial (com verificação de empresa) e gere um System User Token Permanente no Business Manager."
    },
    {
        question: "O que é o WABA ID?",
        answer: "WABA ID é o identificador da sua WhatsApp Business Account. Você encontra no Meta Business Suite, em Configurações > Contas > Contas do WhatsApp."
    },
    {
        question: "E o Phone Number ID?",
        answer: "É o ID do número de telefone registrado dentro da sua WABA. Ele é diferente do número em si e pode ser encontrado no painel de configuração do WhatsApp Cloud API."
    },
    {
        question: "Meu token fica seguro?",
        answer: "Sim. O System Token é armazenado no Supabase Vault (criptografado) e nunca é retornado pelo backend. Apenas os workers autorizados conseguem ler o segredo para enviar mensagens."
    }
]

function FAQItem({ question, answer }: { question: string, answer: string }) {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <div className="border rounded-lg bg-white overflow-hidden transition-all duration-200">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 text-left font-medium text-gray-900 focus:outline-none hover:bg-gray-50 transition-colors"
                aria-expanded={isOpen}
            >
                {question}
                {isOpen ? <CaretUp size={16} className="text-gray-500" /> : <CaretDown size={16} className="text-gray-500" />}
            </button>
            <div
                className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="p-4 pt-0 text-sm text-gray-600 border-t">
                    {answer}
                </div>
            </div>
        </div>
    )
}

type ConnectionState = 'loading' | 'connected' | 'disconnected'

export default function WhatsAppCloudAPIPage() {
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

    // On mount / when org loaded: prefill from GET
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
                setSystemToken('') // clear from memory after save
            }
        } catch (err: any) {
            setSaveError(err?.message ?? 'Erro ao salvar integração')
        } finally {
            setIsSaving(false)
        }
    }

    const statusBadge = connectionState === 'connected' ? (
        <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Conectado
        </span>
    ) : connectionState === 'loading' ? (
        <span className="flex items-center gap-1.5 text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse"></div> Verificando...
        </span>
    ) : (
        <span className="flex items-center gap-1.5 text-red-500 bg-red-50 px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Desconectado
        </span>
    )

    const formDisabled = !organizationId || isSaving

    return (
        <div className="max-w-5xl pb-12">
            {/* Header Status */}
            <div className="flex items-center flex-wrap gap-3 justify-between mb-8 pb-6 border-b">
                <div className="flex items-center gap-4">
                    <Link href="/settings/integrations" className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">WhatsApp Cloud API Oficial</h1>
                        <p className="text-gray-500 text-sm mt-1">Integração oficial via Meta Cloud API (WABA + System Token no Vault).</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Status: {statusBadge}
                </div>
            </div>

            {/* Main Info Card — accent DIFERENTE do card UAZAPI (emerald/meta-blue em vez de azul claro) */}
            <div className="bg-gradient-to-r from-emerald-50 to-white border border-emerald-100 rounded-xl p-6 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <WhatsappLogo size={28} weight="fill" className="text-emerald-600" />
                    </div>
                    <div>
                        <h2 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
                            WhatsApp Cloud API Oficial
                            <span className="bg-emerald-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider">Meta</span>
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">Conexão oficial pela nuvem da Meta. Ideal para templates HSM e disparos em escala.</p>
                    </div>
                </div>
                <div className="text-right whitespace-nowrap">
                    <p className="text-xs text-gray-400 mb-1">Armazenamento do token</p>
                    <p className="font-medium text-gray-900 text-sm flex items-center gap-1.5 justify-end">
                        <ShieldCheck size={14} weight="fill" className="text-emerald-600" />
                        Supabase Vault (criptografado)
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Credentials */}
                <div className="lg:col-span-2">
                    <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-8 mb-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <Lightning size={18} weight="fill" className="rotate-45" />
                            </div>
                            <h3 className="font-bold text-gray-900 text-lg">Credenciais do Meta Cloud API</h3>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <label htmlFor="waba_id" className="block text-sm font-semibold text-gray-700 mb-2">
                                    WABA ID (WhatsApp Business Account)
                                </label>
                                <input
                                    id="waba_id"
                                    type="text"
                                    value={wabaId}
                                    onChange={(e) => setWabaId(e.target.value)}
                                    placeholder="Ex: 10928374650123"
                                    disabled={formDisabled}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:bg-gray-50"
                                    required
                                />
                                <p className="text-xs text-gray-400 mt-1.5">Encontre no Meta Business Suite &gt; Configurações &gt; Contas do WhatsApp.</p>
                            </div>

                            <div>
                                <label htmlFor="phone_number_id" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Phone Number ID
                                </label>
                                <input
                                    id="phone_number_id"
                                    type="text"
                                    value={phoneNumberId}
                                    onChange={(e) => setPhoneNumberId(e.target.value)}
                                    placeholder="Ex: 5523478901234567"
                                    disabled={formDisabled}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:bg-gray-50"
                                    required
                                />
                                <p className="text-xs text-gray-400 mt-1.5">ID do número registrado na sua WABA (diferente do número em si).</p>
                            </div>

                            <div>
                                <label htmlFor="system_token" className="block text-sm font-semibold text-gray-700 mb-2">
                                    System User Token (Permanente)
                                </label>
                                <div className="relative">
                                    <input
                                        id="system_token"
                                        type={showToken ? "text" : "password"}
                                        value={systemToken}
                                        onChange={(e) => setSystemToken(e.target.value)}
                                        placeholder={connectionState === 'connected' ? '•••••••••••••• (deixe em branco para manter o atual)' : 'EAAW...'}
                                        disabled={formDisabled}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all pr-10 disabled:bg-gray-50"
                                        required={connectionState !== 'connected'}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowToken(!showToken)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                        tabIndex={-1}
                                    >
                                        {showToken ? <EyeClosed size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                                    <ShieldCheck size={12} weight="fill" className="text-emerald-500" />
                                    Armazenado criptografado no Supabase Vault. Nunca é retornado pelo backend.
                                </p>
                            </div>

                            <div>
                                <label htmlFor="graph_api_version" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Versão da Graph API
                                </label>
                                <input
                                    id="graph_api_version"
                                    type="text"
                                    value={graphApiVersion}
                                    onChange={(e) => setGraphApiVersion(e.target.value)}
                                    placeholder="v21.0"
                                    disabled={formDisabled}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:bg-gray-50"
                                />
                                <p className="text-xs text-gray-400 mt-1.5">Default: v21.0. Altere apenas se a Meta exigir versão específica.</p>
                            </div>
                        </div>

                        {saveError && (
                            <div className="mt-6 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg p-3 flex items-start gap-2">
                                <Info size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
                                <span>{saveError}</span>
                            </div>
                        )}

                        {saveSuccess && (
                            <div className="mt-6 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-lg p-3 flex items-start gap-2">
                                <CheckCircle size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
                                <span>Integração salva com sucesso. Token armazenado no Vault.</span>
                            </div>
                        )}

                        <div className="mt-8">
                            <button
                                type="submit"
                                disabled={formDisabled}
                                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-3 rounded-lg shadow-sm transition-all shadow-emerald-500/20 hover:shadow-emerald-500/40"
                            >
                                <Lightning size={16} weight="fill" />
                                {isSaving ? 'Salvando...' : connectionState === 'connected' ? 'Atualizar Credenciais' : 'Conectar via API Oficial'}
                            </button>
                        </div>
                    </form>

                    {/* FAQs */}
                    <div className="bg-white border rounded-xl p-8 shadow-sm mb-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 border border-gray-200">
                                <BookOpen size={20} className="text-gray-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Perguntas Frequentes (FAQ)</h2>
                                <p className="text-sm text-gray-500">Tire suas dúvidas sobre o funcionamento da API oficial.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {FAQS.map((faq, i) => (
                                <FAQItem key={i} question={faq.question} answer={faq.answer} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Benefits Side */}
                <div className="lg:col-span-1">
                    <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100 shadow-sm">
                        <h3 className="font-bold text-emerald-900 flex items-center gap-2 mb-6 text-lg">
                            <CheckCircle size={20} weight="fill" className="text-emerald-600" />
                            Benefícios da API Oficial
                        </h3>

                        <ul className="space-y-4 text-sm text-emerald-900">
                            <li className="flex gap-3">
                                <CheckCircle size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                <span>Selo oficial de verificação.</span>
                            </li>
                            <li className="flex gap-3">
                                <CheckCircle size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                <span>Zero risco de banimento seguindo as políticas da Meta.</span>
                            </li>
                            <li className="flex gap-3">
                                <CheckCircle size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                <span>Templates HSM aprovados para disparos ativos.</span>
                            </li>
                            <li className="flex gap-3">
                                <CheckCircle size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                <span>Múltiplos atendentes no mesmo número.</span>
                            </li>
                            <li className="flex gap-3">
                                <CheckCircle size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                <span>Token criptografado no Supabase Vault.</span>
                            </li>
                        </ul>
                    </div>

                    <div className="mt-8 text-xs text-gray-400 flex items-center justify-between pt-6 px-2">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse"></div>
                            Ambiente de produção certificado
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
