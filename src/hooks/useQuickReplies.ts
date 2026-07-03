import { useState, useEffect, useCallback } from 'react'

export interface QuickReply {
  id: string
  organizationId: string
  scope: 'shared' | 'personal'
  createdByMemberId: string | null
  shortcut: string
  category: string | null
  content: string
  mediaUrl: string | null
  mediaType: string | null
  mediaMimetype: string | null
  mediaFilename: string | null
  createdAt: string
  updatedAt: string
}

export interface QuickReplyInput {
  scope: 'shared' | 'personal'
  shortcut: string
  category?: string | null
  content?: string
  mediaUrl?: string | null
  mediaType?: string | null
  mediaMimetype?: string | null
  mediaFilename?: string | null
}

export function useQuickReplies(organizationId: string | null | undefined) {
  const [shared, setShared] = useState<QuickReply[]>([])
  const [personal, setPersonal] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!organizationId) {
      setShared([])
      setPersonal([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/quick-replies')
      if (!res.ok) throw new Error('Falha ao carregar respostas rápidas')
      const { data } = await res.json()
      setShared(data?.shared || [])
      setPersonal(data?.personal || [])
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createQuickReply(input: QuickReplyInput) {
    const res = await fetch('/api/quick-replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Falha ao criar resposta rápida')
    await refresh()
    return json.data as QuickReply
  }

  async function updateQuickReply(id: string, input: Partial<QuickReplyInput>) {
    const res = await fetch(`/api/quick-replies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Falha ao atualizar resposta rápida')
    await refresh()
    return json.data as QuickReply
  }

  async function deleteQuickReply(id: string) {
    const res = await fetch(`/api/quick-replies/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error || 'Falha ao excluir resposta rápida')
    }
    await refresh()
  }

  return { shared, personal, loading, error, refresh, createQuickReply, updateQuickReply, deleteQuickReply }
}
