'use client'

import { useState } from 'react'
import { useLeadActivities, useAuth, useChatButtonSettings } from '@/hooks'
import { usePinnedMessages } from '@/hooks/usePinnedMessages'
import { uploadClientFile } from '@/lib/blobClient'
import { LeadWithOwner, LeadActivityWithActor } from '@/lib/types'
import ActivityTimeline from './ActivityTimeline'
import ActivityComposer from './ActivityComposer'
import PinnedMessagesBar from './PinnedMessagesBar'

import { ChatButtonKey } from '@/hooks/useChatButtonSettings'

interface ChatWindowProps {
  lead: LeadWithOwner
  organizationId: string
  onMessageSent?: (content: string) => void
}

export interface ReplyContext {
  messageId: string
  text: string
  sender: string
}

export default function ChatWindow({ lead, organizationId, onMessageSent }: ChatWindowProps) {
  const { activities, loading, sendHumanMessage, sendMediaMessage, deleteMessage } = useLeadActivities(organizationId, lead.id)
  const { pinned, pinnedActivityIds, togglePin } = usePinnedMessages(lead.id)
  const { currentOrganization } = useAuth()
  const { settings: chatButtonSettings, fireWebhook } = useChatButtonSettings()
  const [replyContext, setReplyContext] = useState<ReplyContext | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const handleSendActivity = async (content: string) => {
    if (!content.trim()) return
    setSendError(null)

    if (!currentOrganization) {
      setSendError('Sessão não identificada. Recarregue a página e tente novamente.')
      return
    }

    try {
      if (onMessageSent) onMessageSent(content)

      const replyMessageId = replyContext?.messageId
      const replyPreview = replyContext ? { text: replyContext.text, sender: replyContext.sender } : undefined

      // Clear reply before sending so UI updates immediately
      setReplyContext(null)

      await sendHumanMessage(content, 'whatsapp', currentOrganization.id, replyMessageId, replyPreview)
    } catch (error) {
      console.error('Failed to send activity:', error)
      setSendError('Falha ao enviar mensagem. Verifique sua conexão e tente novamente.')
    }
  }

  const handleSendMedia = async (file: File, caption?: string) => {
    setSendError(null)

    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document'
    if (file.type.startsWith('image/')) mediaType = 'image'
    else if (file.type.startsWith('video/')) mediaType = 'video'
    else if (file.type.startsWith('audio/')) mediaType = 'audio'

    try {
      const url = await uploadClientFile(file, 'chat-media', lead.id)

      if (onMessageSent) onMessageSent(caption || `[${mediaType}]`)
      await sendMediaMessage(url, mediaType, caption || '', file.name, file.type)
    } catch (error) {
      console.error('Failed to send media:', error)
      setSendError('Falha ao enviar mídia. Verifique o arquivo e tente novamente.')
    }
  }

  const handleSendQuickReplyMedia = async (qr: {
    content: string
    mediaUrl: string
    mediaType: string
    mediaFilename?: string | null
    mediaMimetype?: string | null
  }) => {
    setSendError(null)
    try {
      if (onMessageSent) onMessageSent(qr.content || `[${qr.mediaType}]`)
      await sendMediaMessage(
        qr.mediaUrl,
        qr.mediaType as 'image' | 'video' | 'audio' | 'document' | 'sticker',
        qr.content,
        qr.mediaFilename || undefined,
        qr.mediaMimetype || undefined
      )
    } catch (error) {
      console.error('Failed to send quick reply media:', error)
      setSendError('Falha ao enviar mídia. Verifique sua conexão e tente novamente.')
    }
  }

  const handleDeleteMessage = async (activity: LeadActivityWithActor) => {
    setSendError(null)

    const isEvolution = activity.metadata?.channel === 'whatsapp_evolution'
    const confirmMsg = isEvolution
      ? 'Apagar esta mensagem? Ela também será apagada para o cliente no WhatsApp (Nº 2), se ainda estiver dentro do prazo permitido pelo WhatsApp.'
      : 'Apagar esta mensagem do histórico do CRM? A API Oficial do WhatsApp não permite apagar mensagens já enviadas — ela vai continuar visível no celular do cliente.'
    if (!confirm(confirmMsg)) return

    try {
      const result = await deleteMessage(activity.id)
      if (result.channel_supports_delete && !result.deleted_for_everyone) {
        setSendError(`Mensagem removida do CRM, mas não foi possível apagar no WhatsApp do cliente: ${result.delete_error || 'erro desconhecido'}`)
      }
    } catch (error) {
      console.error('Failed to delete message:', error)
      setSendError(error instanceof Error ? error.message : 'Falha ao apagar mensagem.')
    }
  }

  const handleReply = (activity: LeadActivityWithActor) => {
    const messageId = activity.metadata?.message_id || activity.id
    const text = activity.content || ''
    const sender = activity.metadata?.sender_name || activity.actor?.profiles?.full_name || lead.title || 'Lead'

    setReplyContext({ messageId, text, sender })
  }

  const handleUnpin = (activityId: string) => {
    const pin = pinned.find((p) => p.activity_id === activityId)
    if (pin) togglePin(pin.activity)
  }

  return (
    <div
      className="flex flex-col h-full relative overflow-x-hidden"
      style={{
        backgroundColor: 'var(--chat-bg-conversation)',
        backgroundImage: `url('/chat-bg.svg')`,
        backgroundRepeat: 'repeat',
        backgroundSize: 'auto',
      }}
    >
      {/* Pinned Messages */}
      <PinnedMessagesBar pinned={pinned} onUnpin={handleUnpin} />

      {/* Timeline */}
      <ActivityTimeline
        activities={activities}
        loading={loading}
        lead={lead}
        onReply={handleReply}
        onTogglePin={togglePin}
        onDelete={handleDeleteMessage}
        pinnedActivityIds={pinnedActivityIds}
      />

      {/* Send Error Banner */}
      {sendError && (
        <div className="mx-4 mb-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between">
          <span className="text-sm text-red-700 dark:text-red-300">{sendError}</span>
          <button
            onClick={() => setSendError(null)}
            className="text-red-600/70 dark:text-red-400/70 hover:text-red-700 dark:hover:text-red-300 text-xs font-bold ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Composer Bottom */}
      <ActivityComposer
        onSend={handleSendActivity}
        onSendMedia={handleSendMedia}
        onSendQuickReplyMedia={handleSendQuickReplyMedia}
        organizationId={organizationId}
        lead={{ title: lead.title, phone: lead.phone }}
        replyContext={replyContext}
        onCancelReply={() => setReplyContext(null)}
        chatButtonSettings={chatButtonSettings}
        fireWebhook={async (key: ChatButtonKey) => {
          return fireWebhook(key, {
            id: lead.id,
            title: lead.title,
            phone: lead.phone,
            email: lead.email,
            stageName: lead.stage?.name,
          })
        }}
      />
    </div>
  )
}
