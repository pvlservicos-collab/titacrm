'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks'
import NotAuthorized from '@/components/Shared/NotAuthorized'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'
import Button from '@/components/Shared/Button'
import { useNotification } from '@/contexts/NotificationContext'
import { useRouter } from 'next/navigation'

export default function Home() {
  const { loading, permissions, isMaster, roleName } = useAuth()
  const { addNotification } = useNotification()
  const router = useRouter()

  // Abre o chat direto ao acessar o app
  useEffect(() => {
    router.replace('/chat')
  }, [router])

  // Security Check Check
  const isAdmin = isMaster || roleName?.toLowerCase() === 'administrador' || roleName?.toLowerCase() === 'owner'
  if (!loading && !isAdmin && permissions && !permissions.settings?.view_dashboard) {
    return <NotAuthorized />
  }

  if (loading || (!isAdmin && !permissions)) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <LoadingSpinner text="Carregando..." size="lg" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-8">
      <div className="text-center">
        <img src="/logos/Atlas.svg" alt="Follem Logo" className="h-12 w-auto object-contain mx-auto mb-4 drop-shadow-lg" />
        <h1 className="text-3xl font-bold text-ink mb-2 font-display">
          Follem CRM
        </h1>
        <p className="text-muted">
          Sales CRM com AI Insights e Colaboracao em Tempo Real
        </p>
      </div>

      <div className="flex gap-4 mb-12">
        <Button href="/pipeline" variant="primary">Pipeline</Button>
        <Button href="/chat" variant="secondary">Chats</Button>
      </div>

      <div className="mt-8 pt-8 border-t border-line w-full max-w-2xl flex flex-col items-center">
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-6">Testar Nova Central de Notificações</h2>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => {
              addNotification({
                type: 'success',
                title: 'Novo Lead Recebido!',
                message: 'Mariana Costa acaba de entrar no funil via WhatsApp.',
                actionText: 'Visualizar Chat',
                onAction: () => router.push('/chat')
              })
            }}
            className="px-4 py-2 border border-line bg-panel text-ink hover:bg-panel-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Notificação: Novo Lead
          </button>

          <button
            onClick={() => {
              addNotification({
                type: 'message',
                title: 'Suporte Humano Solicitado',
                message: 'O lead João Paulo clicou no botão para falar com um atendente.',
                actionText: 'Assumir Chat',
                onAction: () => router.push('/chat')
              })
            }}
            className="px-4 py-2 border border-line bg-panel text-ink hover:bg-panel-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Notificação: Suporte Humano
          </button>

          <button
            onClick={() => {
              addNotification({
                type: 'error',
                title: 'Falha ao Atualizar Senha',
                message: 'A nova senha deve ser diferente da senha atual.'
              })
            }}
            className="px-4 py-2 border border-line bg-panel text-ink hover:bg-panel-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Erro: Atualizar Senha
          </button>
        </div>
      </div>
    </div>
  )
}
