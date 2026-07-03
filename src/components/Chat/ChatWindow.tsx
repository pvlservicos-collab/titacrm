'use client'

import { useState } from 'react'
import { useLeadActivities, useAuth, useChatButtonSettings } from '@/hooks'
import { LeadWithOwner, LeadActivityWithActor } from '@/lib/types'
import ActivityTimeline from './ActivityTimeline'
import ActivityComposer from './ActivityComposer'

import { ChatButtonKey } from '@/hooks/useChatButtonSettings'

interface ChatWindowProps {
  lead: LeadWithOwner
  organizationId: string
  onMessageSent?: (content: string) => void
  isDark?: boolean
}

export interface ReplyContext {
  messageId: string
  text: string
  sender: string
}

export default function ChatWindow({ lead, organizationId, onMessageSent, isDark }: ChatWindowProps) {
  const { activities, loading, sendHumanMessage, sendMediaMessage } = useLeadActivities(organizationId, lead.id)
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

  const handleSendMedia = async (file: File) => {
    setSendError(null)

    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document'
    if (file.type.startsWith('image/')) mediaType = 'image'
    else if (file.type.startsWith('video/')) mediaType = 'video'
    else if (file.type.startsWith('audio/')) mediaType = 'audio'

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'chat-media')
      formData.append('identifier', lead.id)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao enviar arquivo')
      }
      const { url } = await res.json()

      if (onMessageSent) onMessageSent(`[${mediaType}]`)
      await sendMediaMessage(url, mediaType, '', file.name, file.type)
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

  const handleReply = (activity: LeadActivityWithActor) => {
    const messageId = activity.metadata?.message_id || activity.id
    const text = activity.content || ''
    const sender = activity.metadata?.sender_name || activity.actor?.profiles?.full_name || lead.title || 'Lead'

    setReplyContext({ messageId, text, sender })
  }

  return (
    <div
      className="flex flex-col h-full relative overflow-x-hidden"
      style={{
        backgroundColor: isDark ? '#070e13' : '#0b141a',
        backgroundImage: `url('/chat-bg.svg')`,
        backgroundRepeat: 'repeat',
        backgroundSize: 'auto',
      }}
    >
      {/* Timeline */}
      <ActivityTimeline
        activities={activities}
        loading={loading}
        lead={lead}
        onReply={handleReply}
      />

      {/* Send Error Banner */}
      {sendError && (
        <div className="mx-4 mb-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between">
          <span className="text-sm text-red-300">{sendError}</span>
          <button
            onClick={() => setSendError(null)}
            className="text-red-400/70 hover:text-red-300 text-xs font-bold ml-3"
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
