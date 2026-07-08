'use client'

import Link from 'next/link'
import { ArrowLeft, Eye, EyeClosed, InstagramLogo, CheckCircle, Info, Lightning, CaretUp, CaretDown, BookOpen, ShieldCheck, WarningCircle } from '@phosphor-icons/react'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks'

const FAQS = [
    {
        question: "Preciso de aprovação da Meta para usar isso?",
        answer: "Sim. É preciso um App no Meta for Developers com a permissão instagram_business_manage_messages aprovada em App Review — esse processo pode levar dias ou semanas. Recomendamos iniciar a submissão o quanto antes."
    },
    {
        question: "Que tipo de conta Instagram funciona?",
        answer: "Apenas contas Instagram Business ou Creator, conectadas a uma Page do Facebook. Contas pessoais não têm acesso à Messaging API."
    },
    {
        question: "Existe limite de mensagens?",
        answer: "Sim, cerca de 200 mensagens automáticas por hora por conta. Além disso, só é possível responder livremente dentro de 24h após o cliente escrever — depois disso a Meta pode recusar o envio, diferente do WhatsApp Cloud API que tem templates HSM para reabrir a conversa."
    },
    {
        question: "O token expira?",
        answer: "Sim, tokens de longa duração da Meta expiram a cada 60 dias e precisam ser renovados manualmente no Business Manager. Você recebe um alerta aqui quando faltar menos de 7 dias."
    },
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

export default function InstagramDirectPage() {
    const { organizationId } = useAuth()

    const [instagramBusinessAccountId, setInstagramBusinessAccountId] = useState('')
    const [connectedPageId, setConnectedPageId] = useState('')
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
                const res = await fetch(`/api/integrations/instagram?organization_id=${organizationId}`)
                const data = await res.json()
                if (cancelled) return

                if (data && data.config) {
                    setInstagramBusinessAccountId(data.config.instagram_business_account_id ?? '')
                    setConnectedPageId(data.config.connected_page_id ?? '')
                    setGraphApiVersion(data.config.graph_api_version ?? 'v21.0')
                    setConnectionState(data.status === 'active' ? 'connected' : 'disconnected')
                } else {
                    setConnectionState('disconnected')
                }
            } catch (err) {
                console.error('Failed to load Instagram integration', err)
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
            const res = await fetch('/api/integrations/instagram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: organizationId,
                    instagram_business_account_id: instagramBusinessAccountId.trim(),
                    connected_page_id: connectedPageId.trim(),
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
                setSystemToken('')
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
                        <h1 className="text-2xl font-bold text-gray-900">Instagram Direct</h1>
                        <p className="text-gray-500 text-sm mt-1">Integração via Meta Graph API (Instagram Business + Page conectada).</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Status: {statusBadge}
                </div>
            </div>

            {/* App Review notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex items-start gap-3">
                <WarningCircle size={20} weight="fill" className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                    Esta integração só funciona depois que a Meta aprovar seu App com a permissão <code className="bg-amber-100 px-1 rounded">instagram_business_manage_messages</code> em App Review — inicie esse processo o quanto antes, pode levar dias ou semanas.
                </p>
            </div>

            {/* Main Info Card */}
            <div className="bg-gradient-to-r from-fuchsia-50 to-white border border-fuchsia-100 rounded-xl p-6 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-fuchsia-100 flex items-center justify-center flex-shrink-0">
                        <InstagramLogo size={28} weight="fill" className="text-fuchsia-600" />
                    </div>
                    <div>
                        <h2 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
                            Instagram Direct
                            <span className="bg-fuchsia-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider">Meta</span>
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">Mensagens do Instagram Direct aparecem no mesmo inbox, lado a lado com o WhatsApp.</p>
                    </div>
                </div>
                <div className="text-right whitespace-nowrap">
                    <p className="text-xs text-gray-400 mb-1">Armazenamento do token</p>
                    <p className="font-medium text-gray-900 text-sm flex items-center gap-1.5 justify-end">
                        <ShieldCheck size={14} weight="fill" className="text-fuchsia-600" />
                        Segredo criptografado no banco
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Credentials */}
                <div className="lg:col-span-2">
                    <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-8 mb-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-lg bg-fuchsia-50 flex items-center justify-center text-fuchsia-600">
                                <Lightning size={18} weight="fill" className="rotate-45" />
                            </div>
                            <h3 className="font-bold text-gray-900 text-lg">Credenciais da Instagram Messaging API</h3>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <label htmlFor="ig_business_account_id" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Instagram Business Account ID
                                </label>
                                <input
                                    id="ig_business_account_id"
                                    type="text"
                                    value={instagramBusinessAccountId}
                                    onChange={(e) => setInstagramBusinessAccountId(e.target.value)}
                                    placeholder="Ex: 17841400000000000"
                                    disabled={formDisabled}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all disabled:bg-gray-50"
                                    required
                                />
                                <p className="text-xs text-gray-400 mt-1.5">Encontre no Meta Business Suite &gt; Configurações &gt; Contas do Instagram.</p>
                            </div>

                            <div>
                                <label htmlFor="connected_page_id" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Page ID conectada
                                </label>
                                <input
                                    id="connected_page_id"
                                    type="text"
                                    value={connectedPageId}
                                    onChange={(e) => setConnectedPageId(e.target.value)}
                                    placeholder="Ex: 100928374650123"
                                    disabled={formDisabled}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all disabled:bg-gray-50"
                                    required
                                />
                                <p className="text-xs text-gray-400 mt-1.5">ID da Page do Facebook conectada à conta Instagram Business.</p>
                            </div>

                            <div>
                                <label htmlFor="system_token" className="block text-sm font-semibold text-gray-700 mb-2">
                                    System User Token
                                </label>
                                <div className="relative">
                                    <input
                                        id="system_token"
                                        type={showToken ? "text" : "password"}
                                        value={systemToken}
                                        onChange={(e) => setSystemToken(e.target.value)}
                                        placeholder={connectionState === 'connected' ? '•••••••••••••• (deixe em branco para manter o atual)' : 'EAAW...'}
                                        disabled={formDisabled}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all pr-10 disabled:bg-gray-50"
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
                                    <ShieldCheck size={12} weight="fill" className="text-fuchsia-500" />
                                    Expira a cada 60 dias — você recebe um alerta antes de vencer.
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
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all disabled:bg-gray-50"
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
                                <span>Integração salva com sucesso.</span>
                            </div>
                        )}

                        <div className="mt-8">
                            <button
                                type="submit"
                                disabled={formDisabled}
                                className="w-full flex items-center justify-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-fuchsia-300 text-white font-medium py-3 rounded-lg shadow-sm transition-all shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40"
                            >
                                <Lightning size={16} weight="fill" />
                                {isSaving ? 'Salvando...' : connectionState === 'connected' ? 'Atualizar Credenciais' : 'Conectar Instagram'}
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
                                <p className="text-sm text-gray-500">Tire suas dúvidas sobre o funcionamento da integração.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {FAQS.map((faq, i) => (
                                <FAQItem key={i} question={faq.question} answer={faq.answer} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Limitations Side */}
                <div className="lg:col-span-1">
                    <div className="bg-fuchsia-50 rounded-xl p-6 border border-fuchsia-100 shadow-sm">
                        <h3 className="font-bold text-fuchsia-900 flex items-center gap-2 mb-6 text-lg">
                            <Info size={20} weight="fill" className="text-fuchsia-600" />
                            Limites a saber
                        </h3>

                        <ul className="space-y-4 text-sm text-fuchsia-900">
                            <li className="flex gap-3">
                                <WarningCircle size={16} className="text-fuchsia-600 flex-shrink-0 mt-0.5" />
                                <span>Só responde livremente até 24h após a última mensagem do cliente.</span>
                            </li>
                            <li className="flex gap-3">
                                <WarningCircle size={16} className="text-fuchsia-600 flex-shrink-0 mt-0.5" />
                                <span>Limite de ~200 mensagens automáticas por hora.</span>
                            </li>
                            <li className="flex gap-3">
                                <WarningCircle size={16} className="text-fuchsia-600 flex-shrink-0 mt-0.5" />
                                <span>Não suporta grupos.</span>
                            </li>
                            <li className="flex gap-3">
                                <WarningCircle size={16} className="text-fuchsia-600 flex-shrink-0 mt-0.5" />
                                <span>Token precisa ser renovado a cada 60 dias.</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
