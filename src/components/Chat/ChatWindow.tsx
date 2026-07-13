'use client'

import { useState, useRef } from 'react'
import { Image as ImageIcon } from '@phosphor-icons/react'
import { useLeadActivities, useAuth, useChatButtonSettings } from '@/hooks'
import { usePinnedMessages } from '@/hooks/usePinnedMessages'
import { uploadClientFile } from '@/lib/blobClient'
import { LeadWithOwner, LeadActivityWithActor } from '@/lib/types'
import ActivityTimeline from './ActivityTimeline'
import ActivityComposer, { ActivityComposerHandle } from './ActivityComposer'
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
  const composerRef = useRef<ActivityComposerHandle>(null)

  // Arrastar-e-soltar um arquivo em qualquer ponto da conversa (não só no clipe) —
  // dragCounter conta enter/leave porque o navegador dispara esses eventos toda vez
  // que o cursor cruza um elemento filho da timeline, não só na entrada/saída real
  // da área inteira; sem contar, a sobreposição pisca ou nunca some.
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (!e.dataTransfer.types.includes('Files')) return
    dragCounter.current += 1
    setIsDraggingFile(true)
  }
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault() // necessário pro navegador permitir o drop
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setIsDraggingFile(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDraggingFile(false)
    const file = e.dataTransfer.files?.[0]
    if (file) composerRef.current?.receiveDroppedFile(file)
  }

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

  const handleDeleteMessage = async (activity: LeadActivityWithActor, deleteForEveryone: boolean) => {
    setSendError(null)

    try {
      const result = await deleteMessage(activity.id, deleteForEveryone)
      if (deleteForEveryone && result.channel_supports_delete && !result.deleted_for_everyone) {
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
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Overlay de arrastar-e-soltar — cobre a conversa inteira, não só o clipe */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none animate-in fade-in duration-150">
          <div className="flex flex-col items-center gap-3 border-4 border-dashed border-[var(--chat-accent)] rounded-2xl px-12 py-10 bg-[var(--chat-bg-panel)]/90">
            <ImageIcon size={40} weight="bold" className="text-[var(--chat-accent)]" />
            <p className="text-sm font-bold text-[var(--chat-text-primary)]">Solte o arquivo para enviar</p>
          </div>
        </div>
      )}

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
        ref={composerRef}
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
