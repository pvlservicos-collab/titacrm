'use client'

/**
 * useLeadActivities — substitui queries diretas ao Supabase
 * Busca atividades via API + Pusher para realtime
 */
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { LeadActivityWithActor } from '@/lib/types'
import { usePusherChannel } from './usePusher'
import { useNotification } from '@/contexts/NotificationContext'

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp_evolution: 'Nº 2 (Evolution)',
  whatsapp_cloud_official: 'API Oficial',
}

export function useLeadActivities(organizationId: string, leadId: string) {
  const { data: session } = useSession()
  const { addNotification } = useNotification()
  const [activities, setActivities] = useState<LeadActivityWithActor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchActivities = useCallback(async (showLoading = true) => {
    if (!organizationId || !leadId || !session) return
    try {
      if (showLoading) setLoading(true)
      const res = await fetch(`/api/leads/${leadId}/messages`)
      if (!res.ok) throw new Error('Falha ao carregar atividades')
      const json = await res.json()

      const filtered = (json.data || []).filter((a: any) => {
        if (a.type === 'system' && a.metadata?.source === 'custom_field') return false
        return true
      })
      setActivities(filtered)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [organizationId, leadId, session])

  useEffect(() => {
    fetchActivities(true)
  }, [fetchActivities])

  // Realtime via Pusher
  usePusherChannel(`lead-${leadId}`, {
    'activity.created': () => {
      setActivities((prev) => prev.filter((a) => !a.metadata?.is_optimistic))
      fetchActivities(false)
    },
    'activity.updated': () => fetchActivities(false),
    '__reconnected': () => fetchActivities(false),
  })

  const sendHumanMessage = async (
    content: string,
    type: 'whatsapp' | 'note' | 'system' = 'whatsapp',
    memberId?: string,
    replyMessageId?: string,
    replyPreview?: { text: string; sender: string }
  ) => {
    if (!content.trim()) return

    // Optimistic update
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: LeadActivityWithActor = {
      id: tempId,
      organization_id: organizationId,
      lead_id: leadId,
      type,
      content,
      actor_member_id: memberId || null,
      metadata: {
        direction: 'outbound',
        source: 'human',
        status: 'sent',
        is_optimistic: true,
        ...(replyMessageId && replyPreview
          ? { quoted_text: replyPreview.text, quoted_sender: replyPreview.sender, quoted_stanza_id: replyMessageId }
          : {}),
      },
      created_at: new Date().toISOString(),
      actor: undefined,
    }
    setActivities((prev) => [...prev, optimisticMsg])

    try {
      const body: any = {
        content,
        type,
        source: 'human',
        direction: 'outbound',
      }
      if (replyMessageId) body.reply_to_message_id = replyMessageId

      const res = await fetch(`/api/leads/${leadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Falha ao enviar mensagem')
      }

      const data = await res.json()
      if (data.send_status === 'failed') {
        const channelLabel = CHANNEL_LABELS[data.channel] || data.channel || 'WhatsApp'
        addNotification({
          type: 'error',
          title: 'Falha ao enviar mensagem',
          message: `Não foi possível enviar para ${data.lead_name || 'o contato'} via ${channelLabel}: ${data.send_error || 'erro desconhecido'}`,
        })
      }

      // Remove optimistic, realtime vai trazer o real
      setActivities((prev) => prev.filter((a) => a.id !== tempId))
    } catch (err) {
      // Revert optimistic on error
      setActivities((prev) => prev.filter((a) => a.id !== tempId))
      throw err
    }
  }

  const MEDIA_LABELS: Record<string, string> = {
    image: '📷 Imagem',
    video: '🎥 Vídeo',
    audio: '🎵 Áudio',
    document: '📄 Documento',
    sticker: '✨ Figurinha',
  }

  const sendMediaMessage = async (
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker',
    caption: string,
    mediaFilename?: string,
    mediaMimetype?: string
  ) => {
    const content = caption.trim() || MEDIA_LABELS[mediaType] || '📎 Mídia'
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: LeadActivityWithActor = {
      id: tempId,
      organization_id: organizationId,
      lead_id: leadId,
      type: 'whatsapp',
      content,
      actor_member_id: null,
      metadata: {
        direction: 'outbound',
        source: 'human',
        status: 'sent',
        is_optimistic: true,
        media_url: mediaUrl,
        media_type: mediaType,
        media_filename: mediaFilename,
        media_mimetype: mediaMimetype,
      },
      created_at: new Date().toISOString(),
      actor: undefined,
    }
    setActivities((prev) => [...prev, optimisticMsg])

    try {
      const body: any = {
        content,
        // Legenda de verdade — só preenchida se alguém realmente escreveu algo.
        // "content" acima pode ser um rótulo interno (ex: "📷 Imagem") usado só
        // pra timeline/lista do CRM; nunca deve ser enviado como legenda real.
        caption: caption.trim() || null,
        type: 'whatsapp',
        source: 'human',
        direction: 'outbound',
        media_url: mediaUrl,
        media_type: mediaType,
        media_filename: mediaFilename,
        media_mimetype: mediaMimetype,
      }

      const res = await fetch(`/api/leads/${leadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Falha ao enviar mídia')
      }

      const data = await res.json()
      if (data.send_status === 'failed') {
        const channelLabel = CHANNEL_LABELS[data.channel] || data.channel || 'WhatsApp'
        addNotification({
          type: 'error',
          title: 'Falha ao enviar mídia',
          message: `Não foi possível enviar para ${data.lead_name || 'o contato'} via ${channelLabel}: ${data.send_error || 'erro desconhecido'}`,
        })
      }

      setActivities((prev) => prev.filter((a) => a.id !== tempId))
    } catch (err) {
      setActivities((prev) => prev.filter((a) => a.id !== tempId))
      throw err
    }
  }

  const deleteMessage = async (activityId: string, deleteForEveryone: boolean) => {
    // Optimistic: já mostra o balão "Mensagem apagada" antes da resposta do servidor
    const prevActivities = activities
    setActivities((prev) =>
      prev.map((a) => (a.id === activityId ? { ...a, metadata: { ...a.metadata, deleted: true } } : a))
    )

    try {
      const res = await fetch(`/api/leads/${leadId}/messages/${activityId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteForEveryone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao apagar mensagem')
      return data as {
        success: true
        deleted_for_everyone: boolean
        channel_supports_delete: boolean
        delete_error: string | null
      }
    } catch (err) {
      setActivities(prevActivities)
      throw err
    }
  }

  return { activities, loading, error, sendHumanMessage, sendMediaMessage, deleteMessage, refresh: fetchActivities }
}
