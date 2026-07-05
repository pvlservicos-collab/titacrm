'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { PencilSimple, SpinnerGap, UploadSimple, Key, Copy, Eye, EyeSlash, Trash, Plus } from '@phosphor-icons/react'
import { useAuth } from '@/hooks'
import { useSession } from 'next-auth/react'

interface ApiToken {
    id: string
    name: string
    token_prefix: string
    is_active: boolean
    created_at: string
    last_used_at: string | null
    revoked_at: string | null
}

async function hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(token)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function ProfileSettingsPage() {
    const { organizationId, roleName, isMaster, currentOrganization } = useAuth()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const isAdmin = isMaster || roleName === 'Administrador'

    // API Token state
    const [tokens, setTokens] = useState<ApiToken[]>([])
    const [tokensLoading, setTokensLoading] = useState(false)
    const [newTokenName, setNewTokenName] = useState('Token de API')
    const [generatedToken, setGeneratedToken] = useState<string | null>(null)
    const [tokenCopied, setTokenCopied] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [showTokenForm, setShowTokenForm] = useState(false)
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

    // Fetch existing tokens
    const fetchTokens = useCallback(async () => {
        if (!organizationId || !isAdmin) return
        setTokensLoading(true)
        try {
            const res = await fetch('/api/tokens')
            if (res.ok) {
                const { data } = await res.json()
                setTokens((data || []).map((t: any) => ({ ...t, token_prefix: t.name?.slice(0, 12) || 'atl_...' })))
            }
        } catch (err) {
            console.error('Error fetching tokens:', err)
        } finally {
            setTokensLoading(false)
        }
    }, [organizationId, isAdmin])

    useEffect(() => { fetchTokens() }, [fetchTokens])

    const generateToken = async () => {
        if (!organizationId || !currentOrganization?.id) return
        setIsGenerating(true)
        try {
            // Generate a secure random token
            const rawToken = `atl_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
            const tokenHash = await hashToken(rawToken)
            const tokenPrefix = rawToken.slice(0, 12)

            const res = await fetch('/api/tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTokenName || 'Token de API', token_hash: tokenHash }),
            })
            if (!res.ok) throw new Error('Failed to create token')

            setGeneratedToken(rawToken)
            setNewTokenName('Token de API')
            setShowTokenForm(false)
            await fetchTokens()
        } catch (err) {
            console.error('Error generating token:', err)
        } finally {
            setIsGenerating(false)
        }
    }

    const deleteToken = async (tokenId: string) => {
        try {
            await fetch(`/api/tokens?id=${tokenId}`, { method: 'DELETE' })
            await fetchTokens()
        } catch (err) {
            console.error('Error deleting token:', err)
        }
    }

    const copyToken = async (token: string) => {
        await navigator.clipboard.writeText(token)
        setTokenCopied(true)
        setTimeout(() => setTokenCopied(false), 2000)
    }

    const [profileData, setProfileData] = useState({
        name: '',
        logo_url: '',
        corporate_email: '',
        phone: '',
        website: '',
        foundation_date: ''
    })
    const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // Fetch existing organization profile
    useEffect(() => {
        async function fetchOrgProfile() {
            // Wait for context to provide the ID
            if (!organizationId) {
                // Do not leave it loading indefinitely if no org is found
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            try {
                const res = await fetch('/api/organizations')
                if (!res.ok) throw new Error('Failed to fetch org')
                const { data } = await res.json()

                if (data) {
                    setProfileData({
                        name: data.name || '',
                        logo_url: data.logo_url || data.logoUrl || '',
                        corporate_email: '',
                        phone: '',
                        website: '',
                        foundation_date: ''
                    })
                }
            } catch (err) {
                console.error("Error fetching org profile:", err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchOrgProfile()
    }, [organizationId])

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        console.log('handleLogoUpload triggered:', { file, organizationId })

        if (!file) return

        if (!organizationId) {
            setMessage({ type: 'error', text: 'Erro: Nenhuma organização ativa selecionada no contexto de autenticação.' })
            return
        }

        if (file.size > 2 * 1024 * 1024) {
            setMessage({ type: 'error', text: 'A imagem deve ter no máximo 2MB.' })
            return
        }

        // Criar preview local imediatamente para UX rápida
        const objectUrl = URL.createObjectURL(file)
        setLogoPreview(objectUrl)

        setIsLoading(true)
        setMessage(null)

        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `logo_${organizationId}_${Math.random()}.${fileExt}`
            const filePath = `${organizationId}/${fileName}`

            // Upload via Vercel Blob
            const formData = new FormData()
            formData.append('file', file)
            formData.append('folder', 'org-logos')
            formData.append('identifier', organizationId || 'org')
            const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
            if (!uploadRes.ok) throw new Error('Falha no upload')
            const { url: publicUrl } = await uploadRes.json()

            // Update local state, actual DB save happens when "Salvar Alterações" is clicked
            setProfileData(prev => ({ ...prev, logo_url: publicUrl }))
            setLogoPreview(null) // Volta a usar logo_url principal após sucesso
            setMessage({ type: 'success', text: 'Logo transferida com sucesso! Lembre-se de salvar as alterações.' })

            // Auto limpando a mensagem de sucesso
            setTimeout(() => setMessage(null), 3000)

        } catch (error: any) {
            console.error('Error uploading logo:', error)
            setLogoPreview(null) // Reverte o preview em erro
            const errorMsg = error.message || 'Erro desconhecido.'
            setMessage({ type: 'error', text: `Erro de upload Supabase: ${errorMsg}` })
        } finally {
            setIsLoading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleSave = async () => {
        if (!organizationId) {
            setMessage({ type: 'error', text: 'Erro: Nenhuma organização ativa para salvar.' })
            return
        }

        setIsSaving(true)
        setMessage(null)
        try {
            const res = await fetch('/api/organizations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: profileData.name, logo_url: profileData.logo_url }),
            })
            if (!res.ok) throw new Error('Failed to save')

            setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' })

            // Clear success message after 3 seconds
            setTimeout(() => setMessage(null), 3000)

        } catch (err: any) {
            console.error("Error saving org profile:", err)
            const errorMsg = err.message || 'Erro desconhecido.'
            setMessage({ type: 'error', text: `Erro ao salvar: ${errorMsg}` })
        } finally {
            setIsSaving(false)
        }
    }

    // Determine qual imagem exibir: o preview não-salvo, ou a foto da base de dados.
    const displayLogo = logoPreview || profileData.logo_url

    // Basic layout mirroring the provided UI design
    return (
        <div className="max-w-3xl space-y-6">

            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 pb-1">Perfil da Organização</h1>
                    <p className="text-sm text-gray-500">Gerencie os detalhes públicos e de contato da sua empresa.</p>
                </div>
                {message && (
                    <div className={`px-4 py-2 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        {message.text}
                    </div>
                )}
            </div>

            {/* Logo Section */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-6 shadow-sm">
                <div className="relative">
                    <div className="w-24 h-24 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-300 overflow-hidden">
                        {displayLogo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={displayLogo} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M9 8h1v1H9z"></path><path d="M9 12h1v1H9z"></path><path d="M9 16h1v1H9z"></path><path d="M14 8h1v1h-1z"></path><path d="M14 12h1v1h-1z"></path><path d="M14 16h1v1h-1z"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
                        )}
                        {isLoading && (
                            <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-xl">
                                <SpinnerGap className="animate-spin text-blue-600" size={24} weight="bold" />
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        type="button"
                        className="absolute -bottom-2 -right-2 bg-white border border-gray-200 text-gray-600 rounded-lg p-1.5 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        <PencilSimple size={16} weight="bold" />
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleLogoUpload}
                        accept="image/png, image/jpeg"
                        className="hidden"
                    />
                </div>

                <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">Logo da Organização</h3>
                    <p className="text-xs text-gray-500 mb-3">Formatos aceitos: PNG, JPG. Máximo 2MB.</p>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                        <UploadSimple size={16} />
                        Alterar Foto
                    </button>
                </div>
            </div>

            {/* General Information Section */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Informações Gerais</h3>

                <div className="space-y-4">

                    {/* Organization Name */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                            Nome da Organização
                        </label>
                        <input
                            type="text"
                            value={profileData.name}
                            onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                            disabled={isLoading}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 disabled:bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Corporate Email */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                E-mail Corporativo
                            </label>
                            <input
                                type="email"
                                value={profileData.corporate_email}
                                onChange={(e) => setProfileData({ ...profileData, corporate_email: e.target.value })}
                                disabled={isLoading}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 disabled:bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                Telefone
                            </label>
                            <input
                                type="text"
                                value={profileData.phone}
                                onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                                disabled={isLoading}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 disabled:bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Website / Data Fundacao Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Website */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                Website
                            </label>
                            <input
                                type="url"
                                value={profileData.website}
                                onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                                disabled={isLoading}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 disabled:bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                        </div>

                        {/* Foundation Date */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                Data de fundação da empresa
                            </label>
                            <input
                                type="date"
                                value={profileData.foundation_date}
                                onChange={(e) => setProfileData({ ...profileData, foundation_date: e.target.value })}
                                disabled={isLoading}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 disabled:bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                    </div>

                </div>

                <div className="pt-4 flex justify-end gap-4 items-center">
                    <button
                        onClick={handleSave}
                        disabled={isLoading || isSaving}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                    >
                        {(isLoading || isSaving) && <SpinnerGap className="animate-spin" weight="bold" />}
                        Salvar Alterações
                    </button>
                </div>
            </div>

            {/* API Tokens Section — Admin Only */}
            {isAdmin && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Key size={18} weight="bold" className="text-blue-600" />
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tokens de API</h3>
                        </div>
                        <button
                            onClick={() => { setShowTokenForm(!showTokenForm); setGeneratedToken(null) }}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1.5"
                        >
                            <Plus size={16} weight="bold" />
                            Gerar novo token
                        </button>
                    </div>

                    <p className="text-xs text-gray-500">
                        Tokens de API permitem que sistemas externos (agentes IA, automações, webhooks) acessem a API do Atlas Eye em nome desta organização. <strong>O token é exibido apenas uma vez</strong> — copie e guarde em local seguro.
                    </p>

                    {/* Generated Token Alert */}
                    {generatedToken && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                            <p className="text-sm font-semibold text-green-800">✅ Token gerado com sucesso!</p>
                            <p className="text-xs text-green-700">Copie agora — ele não será exibido novamente.</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 bg-white border border-green-300 rounded px-3 py-2 text-xs font-mono text-gray-800 break-all select-all">
                                    {generatedToken}
                                </code>
                                <button
                                    onClick={() => copyToken(generatedToken)}
                                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${tokenCopied
                                        ? 'bg-green-600 text-white'
                                        : 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
                                        }`}
                                >
                                    <Copy size={14} />
                                    {tokenCopied ? 'Copiado!' : 'Copiar'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* New Token Form */}
                    {showTokenForm && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                            <label className="block text-sm font-semibold text-gray-700">Nome do token</label>
                            <input
                                type="text"
                                value={newTokenName}
                                onChange={(e) => setNewTokenName(e.target.value)}
                                placeholder="Ex: Agente IA, n8n, Zapier..."
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={generateToken}
                                    disabled={isGenerating}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isGenerating && <SpinnerGap className="animate-spin" weight="bold" size={14} />}
                                    Gerar Token
                                </button>
                                <button
                                    onClick={() => setShowTokenForm(false)}
                                    className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Token List */}
                    {tokensLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <SpinnerGap className="animate-spin text-blue-600" size={24} weight="bold" />
                        </div>
                    ) : tokens.length === 0 ? (
                        <div className="text-center py-8 text-sm text-gray-400">
                            Nenhum token de API criado ainda.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tokens.map((token) => (
                                <div
                                    key={token.id}
                                    className="rounded-lg border border-gray-200 bg-white transition-colors overflow-hidden"
                                >
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-3">
                                            <Key size={16} weight="bold" className="text-blue-500" />
                                            <div>
                                                <p className="text-sm font-semibold text-gray-800">{token.name}</p>
                                                <p className="text-xs text-gray-400 font-mono">
                                                    {token.token_prefix}{'•'.repeat(24)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-gray-400">
                                                Criado em {new Date(token.created_at).toLocaleDateString('pt-BR')}
                                            </span>
                                            <button
                                                onClick={() => setConfirmingDeleteId(token.id)}
                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Deletar token"
                                            >
                                                <Trash size={16} weight="bold" />
                                            </button>
                                        </div>
                                    </div>
                                    {confirmingDeleteId === token.id && (
                                        <div className="bg-red-50 border-t border-red-200 px-4 py-3 flex items-center justify-between">
                                            <p className="text-sm text-red-700">
                                                ⚠️ <strong>Ação irreversível.</strong> Este token será deletado permanentemente.
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setConfirmingDeleteId(null)}
                                                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        await deleteToken(token.id)
                                                        setConfirmingDeleteId(null)
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                                                >
                                                    Confirmar exclusão
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
