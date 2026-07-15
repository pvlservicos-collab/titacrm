'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { LeadWithOwner, SearchHit } from '@/lib/types'
import { MagnifyingGlass, PushPin, Archive, ArrowCounterClockwise, Tag as TagIcon, Check } from '@phosphor-icons/react'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'
import { useSession } from 'next-auth/react'
import { useLeadSearch } from '@/hooks/useLeadSearch'
import { useTags } from '@/hooks'
import { getLeadChannel } from '@/lib/leadChannel'
import LeadListItem from './LeadListItem'
import ChatFilterTabs, { type ChatTab } from './ChatFilterTabs'

interface LeadListProps {
  leads: LeadWithOwner[]
  selectedLeadId?: string
  onSelectLead: (lead: LeadWithOwner) => void
  onUpdateLead?: (leadId: string, updates: Partial<LeadWithOwner>) => void
  loading: boolean
  organizationId?: string | null
}

const WEEKDAYS_PT = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
]

function formatRelativeTime(dateString?: string) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const today = new Date()

  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const diffTime = todayDay.getTime() - dateDay.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const timeStr = `${hours}:${minutes}`

  if (diffDays === 0) return timeStr
  if (diffDays === 1) return `Ontem ${timeStr}`

  if (diffDays >= 2 && diffDays <= 6) {
    return `${WEEKDAYS_PT[date.getDay()]} ${timeStr}`
  }

  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  lead: LeadWithOwner | null
}

export default function LeadList({
  leads,
  selectedLeadId,
  onSelectLead,
  onUpdateLead,
  loading,
  organizationId,
}: LeadListProps) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<ChatTab>('all')
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, lead: null
  })
  const [seenReplies, setSeenReplies] = useState<Record<string, string>>({})

  // Filtro por etiqueta — multi-seleção, combina com a aba ativa (ex: "Não lidas" +
  // etiqueta "VIP" ao mesmo tempo) em vez de ser mais uma aba.
  const { allTags } = useTags(organizationId)
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const tagFilterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tagFilterOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target as Node)) {
        setTagFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [tagFilterOpen])

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]))
  }

  // Load "seen" map from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('lead_seen_replies')
      if (stored) setSeenReplies(JSON.parse(stored))
    } catch {}
  }, [])

  const markReplySeen = useCallback((leadId: string, lastActivityAt?: string) => {
    if (!lastActivityAt) return
    setSeenReplies(prev => {
      if (prev[leadId] === lastActivityAt) return prev
      const next = { ...prev, [leadId]: lastActivityAt }
      try { localStorage.setItem('lead_seen_replies', JSON.stringify(next)) } catch {}
      return next
    })
  }, [])
  const menuRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const INITIAL_DISPLAY = 20
  const DISPLAY_INCREMENT = 15
  const [displayLimit, setDisplayLimit] = useState(INITIAL_DISPLAY)

  const { results: searchResults, loading: searching } = useLeadSearch(search)

  // Infinite scroll
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight - scrollTop - clientHeight < 200) {
        setDisplayLimit(prev => prev + DISPLAY_INCREMENT)
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Close context menu on outside click or scroll
  useEffect(() => {
    const handleClose = () => setContextMenu(prev => ({ ...prev, visible: false }))
    if (contextMenu.visible) {
      document.addEventListener('click', handleClose)
      document.addEventListener('scroll', handleClose, true)
      return () => {
        document.removeEventListener('click', handleClose)
        document.removeEventListener('scroll', handleClose, true)
      }
    }
  }, [contextMenu.visible])

  const markLeadAsRead = useCallback((leadId: string) => {
    const lead = leads.find(l => l.id === leadId)
    if (lead?.is_unread) {
      // Optimistic Update immediately to prevent duplicate network requests
      if (onUpdateLead) {
        onUpdateLead(lead.id, { is_unread: false })
      }

      // Send network request without awaiting here to avoid blocking
      fetch(`/api/leads/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_unread: false }) })
    }
  }, [leads, onUpdateLead])

  // Mark as read whenever the selected lead changes and has unread messages
  useEffect(() => {
    if (selectedLeadId && document.hasFocus()) {
      markLeadAsRead(selectedLeadId)
      const lead = leads.find(l => l.id === selectedLeadId)
      if (lead) markReplySeen(lead.id, lead.last_activity_at)
    }
  }, [selectedLeadId, markLeadAsRead, markReplySeen, leads])

  // Mark as read when the window gains focus (if reading currently)
  useEffect(() => {
    const handleFocus = () => {
      if (selectedLeadId) {
        markLeadAsRead(selectedLeadId)
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [selectedLeadId, markLeadAsRead])

  const handleContextMenu = useCallback((e: React.MouseEvent, lead: LeadWithOwner) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, lead })
  }, [])

  const handleTogglePin = useCallback(async () => {
    if (!contextMenu.lead) return
    const lead = contextMenu.lead
    const newPinned = !lead.is_pinned

    // Optimistic update
    if (onUpdateLead) {
      onUpdateLead(lead.id, { is_pinned: newPinned })
    }

    setContextMenu(prev => ({ ...prev, visible: false }))

    try {
      await fetch(`/api/leads/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_pinned: newPinned }) })
    } catch (err) {
      console.error('Failed to toggle pin', err)
      // Revert
      if (onUpdateLead) {
        onUpdateLead(lead.id, { is_pinned: !newPinned })
      }
    }
  }, [contextMenu.lead, onUpdateLead])

  const handleToggleArchive = useCallback(async () => {
    if (!contextMenu.lead) return
    const lead = contextMenu.lead
    const newArchived = !lead.is_archived

    // Optimistic update
    if (onUpdateLead) {
      onUpdateLead(lead.id, { is_archived: newArchived })
    }

    setContextMenu(prev => ({ ...prev, visible: false }))

    try {
      await fetch(`/api/leads/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_archived: newArchived }) })
    } catch (err) {
      console.error('Failed to toggle archive', err)
      // Revert
      if (onUpdateLead) {
        onUpdateLead(lead.id, { is_archived: !newArchived })
      }
    }
  }, [contextMenu.lead, onUpdateLead])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner text="Carregando leads..." />
      </div>
    )
  }

  const handleLeadClick = async (lead: LeadWithOwner) => {
    onSelectLead(lead)
    markLeadAsRead(lead.id)
    markReplySeen(lead.id, lead.last_activity_at)
  }

  const filteredHits: SearchHit[] = [...searchResults].sort((a, b) => {
    const ap = !!a.lead.is_pinned
    const bp = !!b.lead.is_pinned
    if (ap !== bp) return ap ? -1 : 1
    const rank = (h: SearchHit) => (h.matchType === 'message' ? 1 : 0)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    const ta = new Date(a.lead.last_activity_at || a.lead.created_at).getTime()
    const tb = new Date(b.lead.last_activity_at || b.lead.created_at).getTime()
    return tb - ta
  })

  // Arquivada some das outras abas (igual WhatsApp) — só a aba "Arquivados" mostra.
  const nonArchivedHits = filteredHits.filter((hit) => !hit.lead.is_archived)

  const tabCounts: Record<ChatTab, number> = { all: nonArchivedHits.length, unread: 0, whatsapp: 0, instagram: 0, archived: 0 }
  for (const hit of nonArchivedHits) {
    if (hit.lead.is_unread) tabCounts.unread++
    const channel = getLeadChannel(hit.lead)
    if (channel === 'whatsapp') tabCounts.whatsapp++
    else if (channel === 'instagram') tabCounts.instagram++
  }
  tabCounts.archived = filteredHits.length - nonArchivedHits.length

  const tabFilteredHitsBeforeTags = activeTab === 'archived'
    ? filteredHits.filter((hit) => hit.lead.is_archived)
    : activeTab === 'all'
      ? nonArchivedHits
      : nonArchivedHits.filter((hit) => {
          if (activeTab === 'unread') return !!hit.lead.is_unread
          return getLeadChannel(hit.lead) === activeTab
        })

  // Etiqueta é um filtro à parte, combinado com a aba ativa — não substitui, só
  // restringe mais. Mantém quem tem pelo menos uma das etiquetas marcadas.
  const tabFilteredHits = selectedTagIds.length === 0
    ? tabFilteredHitsBeforeTags
    : tabFilteredHitsBeforeTags.filter((hit) =>
        hit.lead.lead_tags?.some((lt: any) => selectedTagIds.includes(lt.tag_id))
      )

  const visibleHits = tabFilteredHits.slice(0, displayLimit)

  return (
    <div className="flex flex-col h-full border-r border-[var(--chat-border)] bg-[var(--chat-bg-base)]">
      {/* Search Bar */}
      <div className="p-3 border-b border-[var(--chat-border)]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--chat-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar leads..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--chat-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent)] text-[var(--chat-text-primary)] placeholder-[var(--chat-text-muted)] transition-shadow bg-[var(--chat-bg-field)]"
            />
          </div>

          {allTags.length > 0 && (
            <div className="relative flex-shrink-0" ref={tagFilterRef}>
              <button
                type="button"
                onClick={() => setTagFilterOpen((v) => !v)}
                className={`relative flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
                  selectedTagIds.length > 0
                    ? 'border-[var(--chat-accent)] text-[var(--chat-accent)] bg-[var(--chat-accent)]/10'
                    : 'border-[var(--chat-border)] text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)] hover:bg-[var(--chat-bg-hover)]'
                }`}
                title="Filtrar por etiqueta"
              >
                <TagIcon size={16} />
                {selectedTagIds.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--chat-accent)] text-[var(--chat-bg-conversation)] text-[10px] font-bold flex items-center justify-center">
                    {selectedTagIds.length}
                  </span>
                )}
              </button>

              {tagFilterOpen && (
                <div className="absolute z-50 right-0 top-full mt-1 w-56 max-h-80 overflow-y-auto bg-[var(--chat-bg-menu)] border border-[var(--chat-border)] rounded-xl shadow-xl py-1.5">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--chat-text-muted)]">
                      Etiquetas
                    </span>
                    {selectedTagIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedTagIds([])}
                        className="text-[11px] font-semibold text-[var(--chat-accent)] hover:underline"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  {allTags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTagFilter(tag.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--chat-text-primary)] hover:bg-[var(--chat-bg-hover)] transition-colors"
                      >
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors`}
                          style={{
                            borderColor: tag.color,
                            backgroundColor: isSelected ? tag.color : 'transparent',
                          }}
                        >
                          {isSelected && <Check size={11} weight="bold" className="text-white" />}
                        </span>
                        <span className="truncate">{tag.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ChatFilterTabs activeTab={activeTab} onChange={setActiveTab} counts={tabCounts} />

      {/* Leads List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden chat-dark-scroll">
        {tabFilteredHits.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--chat-text-muted)] text-sm">
            {searching ? 'Buscando…' : 'Nenhum lead encontrado'}
          </div>
        ) : (
          <div className="flex flex-col min-h-full">
            {visibleHits.map((hit) => {
              const lead = hit.lead
              const isSelected = selectedLeadId === lead.id
              const timeStr = formatRelativeTime(lead.last_activity_at || lead.created_at)
              const hideReplyHighlight = !!lead.last_activity_at && seenReplies[lead.id] === lead.last_activity_at

              return (
                <LeadListItem
                  key={lead.id}
                  lead={lead}
                  isSelected={isSelected}
                  timeStr={timeStr}
                  onClick={handleLeadClick}
                  onContextMenu={handleContextMenu}
                  hit={hit}
                  query={search}
                  hideReplyHighlight={hideReplyHighlight}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-[var(--chat-bg-menu)] rounded-xl shadow-xl border border-[var(--chat-border)] py-1.5 min-w-[180px] animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            onClick={handleTogglePin}
            className="w-full text-left px-4 py-2 text-sm text-[var(--chat-text-primary)] hover:bg-[var(--chat-bg-hover)] flex items-center gap-2.5 transition-colors"
          >
            <PushPin size={16} weight={contextMenu.lead?.is_pinned ? 'regular' : 'fill'} className={contextMenu.lead?.is_pinned ? 'text-[var(--chat-text-muted)]' : 'text-[var(--chat-accent)] -rotate-45'} />
            {contextMenu.lead?.is_pinned ? 'Desafixar conversa' : 'Fixar conversa'}
          </button>
          <button
            onClick={handleToggleArchive}
            className="w-full text-left px-4 py-2 text-sm text-[var(--chat-text-primary)] hover:bg-[var(--chat-bg-hover)] flex items-center gap-2.5 transition-colors"
          >
            {contextMenu.lead?.is_archived ? (
              <ArrowCounterClockwise size={16} className="text-[var(--chat-text-muted)]" />
            ) : (
              <Archive size={16} className="text-[var(--chat-text-muted)]" />
            )}
            {contextMenu.lead?.is_archived ? 'Desarquivar conversa' : 'Arquivar conversa'}
          </button>
        </div>
      )}
    </div>
  )
}
