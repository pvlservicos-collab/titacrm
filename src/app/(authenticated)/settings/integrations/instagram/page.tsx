'use client'

import Link from 'next/link'
import { ArrowLeft, Eye, EyeClosed, InstagramLogo, CheckCircle, Info, Lightning, CaretUp, CaretDown, BookOpen, ShieldCheck, WarningCircle, Plus, PencilSimple, Trash, X } from '@phosphor-icons/react'
import { useState, useEffect, useCallback } from 'react'
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
        question: "Posso conectar mais de uma conta do Instagram?",
        answer: "Sim. Cada conta conectada aparece como um card separado abaixo — as mensagens de todas elas caem no mesmo inbox, identificadas pelo canal Instagram."
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

interface InstagramAccount {
    id: string
    name: string
    status: 'active' | 'disabled'
    config: { instagram_business_account_id?: string; connected_page_id?: string; graph_api_version?: string }
    token_obtained_at: string | null
    has_token: boolean
}

function tokenAgeLabel(tokenObtainedAt: string | null): { label: string; warn: boolean } {
    if (!tokenObtainedAt) return { label: 'Token não gerado', warn: true }
    const days = Math.floor((Date.now() - new Date(tokenObtainedAt).getTime()) / (1000 * 60 * 60 * 24))
    const daysLeft = 60 - days
    if (daysLeft <= 0) return { label: 'Token expirado', warn: true }
    if (daysLeft <= 7) return { label: `Token expira em ${daysLeft} dia(s)`, warn: true }
    return { label: `Token válido (expira em ${daysLeft} dias)`, warn: false }
}

const emptyForm = { name: '', instagramBusinessAccountId: '', connectedPageId: '', systemToken: '', graphApiVersion: 'v21.0' }

export default function InstagramDirectPage() {
    const { organizationId } = useAuth()

    const [accounts, setAccounts] = useState<InstagramAccount[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [showToken, setShowToken] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const loadAccounts = useCallback(async () => {
        if (!organizationId) return
        setLoading(true)
        try {
            const res = await fetch(`/api/integrations/instagram?organization_id=${organizationId}`)
            const { data } = await res.json()
            setAccounts(data || [])
        } catch (err) {
            console.error('Failed to load Instagram integrations', err)
        } finally {
            setLoading(false)
        }
    }, [organizationId])

    useEffect(() => { loadAccounts() }, [loadAccounts])

    const openAddForm = () => {
        setForm(emptyForm)
        setSaveError(null)
        setShowForm(true)
    }

    const openEditForm = (account: InstagramAccount) => {
        setForm({
            name: account.name,
            instagramBusinessAccountId: account.config?.instagram_business_account_id || '',
            connectedPageId: account.config?.connected_page_id || '',
            systemToken: '',
            graphApiVersion: account.config?.graph_api_version || 'v21.0',
        })
        setSaveError(null)
        setShowForm(true)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!organizationId) return

        setIsSaving(true)
        setSaveError(null)

        try {
            const res = await fetch('/api/integrations/instagram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: organizationId,
                    name: form.name.trim(),
                    instagram_business_account_id: form.instagramBusinessAccountId.trim(),
                    connected_page_id: form.connectedPageId.trim(),
                    system_token: form.systemToken,
                    graph_api_version: form.graphApiVersion.trim() || 'v21.0',
                }),
            })

            const data = await res.json()
            if (!res.ok) {
                setSaveError(data?.error || 'Erro ao salvar integração')
            } else {
                setShowForm(false)
                setForm(emptyForm)
                await loadAccounts()
            }
        } catch (err: any) {
            setSaveError(err?.message ?? 'Erro ao salvar integração')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (account: InstagramAccount) => {
        if (!confirm(`Desconectar a conta "${account.name}"? As conversas já recebidas continuam no histórico, mas você não vai mais receber nem enviar mensagens novas por ela.`)) return
        setDeletingId(account.id)
        try {
            await fetch(`/api/integrations/instagram/${account.id}`, { method: 'DELETE' })
            await loadAccounts()
        } catch (err) {
            console.error('Failed to delete Instagram integration', err)
        } finally {
            setDeletingId(null)
        }
    }

    const formDisabled = !organizationId || isSaving
    const isEditingExisting = accounts.some(a => a.config?.instagram_business_account_id === form.instagramBusinessAccountId.trim() && form.instagramBusinessAccountId.trim() !== '')

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
                        <p className="text-gray-500 text-sm mt-1">Integração via Meta Graph API (Instagram Business + Page conectada). Suporta várias contas.</p>
                    </div>
                </div>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {accounts.length} {accounts.length === 1 ? 'conta conectada' : 'contas conectadas'}
                </span>
            </div>

            {/* App Review notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex items-start gap-3">
                <WarningCircle size={20} weight="fill" className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                    Esta integração só funciona depois que a Meta aprovar seu App com a permissão <code className="bg-amber-100 px-1 rounded">instagram_business_manage_messages</code> em App Review — inicie esse processo o quanto antes, pode levar dias ou semanas.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    {/* Connected accounts list */}
                    <div className="bg-white border rounded-xl p-6 mb-8 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-900 text-lg">Contas conectadas</h3>
                            <button
                                onClick={openAddForm}
                                className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                            >
                                <Plus size={16} weight="bold" />
                                Adicionar conta
                            </button>
                        </div>

                        {loading ? (
                            <p className="text-sm text-gray-400 py-6 text-center">Carregando...</p>
                        ) : accounts.length === 0 ? (
                            <p className="text-sm text-gray-400 py-6 text-center">Nenhuma conta do Instagram conectada ainda.</p>
                        ) : (
                            <div className="space-y-3">
                                {accounts.map((account) => {
                                    const age = tokenAgeLabel(account.token_obtained_at)
                                    return (
                                        <div key={account.id} className="flex items-center gap-4 border rounded-lg p-4">
                                            <div className="w-10 h-10 rounded-full bg-fuchsia-100 flex items-center justify-center flex-shrink-0">
                                                <InstagramLogo size={20} weight="fill" className="text-fuchsia-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-900 truncate">{account.name}</p>
                                                <p className="text-xs text-gray-400">ID: {account.config?.instagram_business_account_id}</p>
                                                <p className={`text-xs mt-0.5 ${age.warn ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>{age.label}</p>
                                            </div>
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${account.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                                                {account.status === 'active' ? 'Ativa' : 'Desativada'}
                                            </span>
                                            <button
                                                onClick={() => openEditForm(account)}
                                                className="p-2 text-gray-400 hover:text-fuchsia-600 hover:bg-fuchsia-50 rounded-lg transition-colors"
                                                title="Editar / renovar token"
                                            >
                                                <PencilSimple size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(account)}
                                                disabled={deletingId === account.id}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                title="Desconectar"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Add/Edit Form */}
                    {showForm && (
                        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-8 mb-8 shadow-sm relative">
                            <button type="button" onClick={() => setShowForm(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">
                                <X size={18} />
                            </button>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-8 h-8 rounded-lg bg-fuchsia-50 flex items-center justify-center text-fuchsia-600">
                                    <Lightning size={18} weight="fill" className="rotate-45" />
                                </div>
                                <h3 className="font-bold text-gray-900 text-lg">
                                    {isEditingExisting ? 'Atualizar conta' : 'Nova conta do Instagram'}
                                </h3>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                                        Nome / apelido da conta
                                    </label>
                                    <input
                                        id="name"
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="Ex: @geicymaralves"
                                        disabled={formDisabled}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all disabled:bg-gray-50"
                                        required
                                    />
                                    <p className="text-xs text-gray-400 mt-1.5">Só pra você identificar essa conta na lista — não precisa ser o @ exato.</p>
                                </div>

                                <div>
                                    <label htmlFor="ig_business_account_id" className="block text-sm font-semibold text-gray-700 mb-2">
                                        Instagram Business Account ID
                                    </label>
                                    <input
                                        id="ig_business_account_id"
                                        type="text"
                                        value={form.instagramBusinessAccountId}
                                        onChange={(e) => setForm(f => ({ ...f, instagramBusinessAccountId: e.target.value }))}
                                        placeholder="Ex: 17841400000000000"
                                        disabled={formDisabled}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all disabled:bg-gray-50"
                                        required
                                    />
                                    <p className="text-xs text-gray-400 mt-1.5">No Meta for Developers, em "Personalizar caso de uso &gt; API do Instagram &gt; Gerar tokens de acesso" — é o número embaixo do nome da conta.</p>
                                </div>

                                <div>
                                    <label htmlFor="connected_page_id" className="block text-sm font-semibold text-gray-700 mb-2">
                                        Page ID conectada
                                    </label>
                                    <input
                                        id="connected_page_id"
                                        type="text"
                                        value={form.connectedPageId}
                                        onChange={(e) => setForm(f => ({ ...f, connectedPageId: e.target.value }))}
                                        placeholder="Ex: 100928374650123"
                                        disabled={formDisabled}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all disabled:bg-gray-50"
                                        required
                                    />
                                    <p className="text-xs text-gray-400 mt-1.5">ID da Page do Facebook conectada a essa conta Instagram Business (Meta Business Suite &gt; Configurações &gt; Contas).</p>
                                </div>

                                <div>
                                    <label htmlFor="system_token" className="block text-sm font-semibold text-gray-700 mb-2">
                                        Token de acesso
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="system_token"
                                            type={showToken ? "text" : "password"}
                                            value={form.systemToken}
                                            onChange={(e) => setForm(f => ({ ...f, systemToken: e.target.value }))}
                                            placeholder={isEditingExisting ? '•••••••••••••• (deixe em branco para manter o atual)' : 'EAAW...'}
                                            disabled={formDisabled}
                                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all pr-10 disabled:bg-gray-50"
                                            required={!isEditingExisting}
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
                                        Gere em "Gerar tokens de acesso", na mesma tela do Meta. Expira a cada 60 dias.
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="graph_api_version" className="block text-sm font-semibold text-gray-700 mb-2">
                                        Versão da Graph API
                                    </label>
                                    <input
                                        id="graph_api_version"
                                        type="text"
                                        value={form.graphApiVersion}
                                        onChange={(e) => setForm(f => ({ ...f, graphApiVersion: e.target.value }))}
                                        placeholder="v21.0"
                                        disabled={formDisabled}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all disabled:bg-gray-50"
                                    />
                                </div>
                            </div>

                            {saveError && (
                                <div className="mt-6 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg p-3 flex items-start gap-2">
                                    <Info size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
                                    <span>{saveError}</span>
                                </div>
                            )}

                            <div className="mt-8">
                                <button
                                    type="submit"
                                    disabled={formDisabled}
                                    className="w-full flex items-center justify-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-fuchsia-300 text-white font-medium py-3 rounded-lg shadow-sm transition-all shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40"
                                >
                                    <Lightning size={16} weight="fill" />
                                    {isSaving ? 'Salvando...' : isEditingExisting ? 'Salvar alterações' : 'Conectar conta'}
                                </button>
                            </div>
                        </form>
                    )}

                    {accounts.length > 0 && !showForm && (
                        <div className="mb-8 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-lg p-3 flex items-start gap-2">
                            <CheckCircle size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
                            <span>{accounts.length === 1 ? '1 conta conectada' : `${accounts.length} contas conectadas`}. Use "Adicionar conta" pra conectar outra, ou o lápis pra renovar o token de uma existente.</span>
                        </div>
                    )}

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
                                <span>Limite de ~200 mensagens automáticas por hora, por conta.</span>
                            </li>
                            <li className="flex gap-3">
                                <WarningCircle size={16} className="text-fuchsia-600 flex-shrink-0 mt-0.5" />
                                <span>Não suporta grupos.</span>
                            </li>
                            <li className="flex gap-3">
                                <WarningCircle size={16} className="text-fuchsia-600 flex-shrink-0 mt-0.5" />
                                <span>Token de cada conta precisa ser renovado a cada 60 dias.</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
