'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  CollisionDetection,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { usePipeline, useAuth, useIsMobile } from '@/hooks'
import { useLeadsContext } from '@/contexts/LeadsContext'
import { usePipelineFilters } from '@/contexts/FilterContext'
import { LeadWithOwner } from '@/lib/types'
import FilterButton, { FilterState } from '@/components/Shared/FilterButton'
import StageColumn from './StageColumn'
import LeadCard from './LeadCard'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'
import { X } from '@phosphor-icons/react'

interface PipelineBoardProps {
  organizationId: string
  filters?: FilterState
}

export default function PipelineBoard({ organizationId, filters }: PipelineBoardProps) {
  const searchParams = useSearchParams()
  const pipelineIdFromUrl = searchParams.get('pipelineId')

  const { pipelines, stages, selectedPipelineId, selectPipeline, loading } =
    usePipeline(organizationId)

  const { currentOrganization, permissions } = useAuth()

  const { leads: globalLeads, moveLeadToStage, setLeads, stageStats } = useLeadsContext()
  const { setFilters } = usePipelineFilters()

  // Apply pipeline-specific filters in memory
  const leads = useMemo(() => {
    return globalLeads.filter(l => {
      // Exclude groups from pipeline
      if (l.is_group) return false

      // Filter by permissions if needed
      if (permissions?.leads?.view_own_only && currentOrganization?.id) {
        if (l.owner_member_id !== currentOrganization.id) return false
      }

      return true
    })
  }, [globalLeads, permissions, currentOrganization])

  console.log('[PipelineBoard] pipelines length:', pipelines?.length, 'stages length:', stages?.length, 'selectedPipelineId:', selectedPipelineId);

  const activePipeline = pipelines.find(p => p.id === selectedPipelineId)
  const isGoalsEnabled = activePipeline?.settings?.goals_enabled || false
  const [activeLead, setActiveLead] = useState<LeadWithOwner | null>(null)
  const [activeLeadOriginalStage, setActiveLeadOriginalStage] = useState<string | null>(null)

  const isMobile = useIsMobile()
  const [activeMobileStageId, setActiveMobileStageId] = useState<string | null>(null)
  const [movingLead, setMovingLead] = useState<LeadWithOwner | null>(null)

  // Sync URL pipelineId with selected pipeline
  useEffect(() => {
    if (pipelineIdFromUrl && pipelineIdFromUrl !== selectedPipelineId) {
      selectPipeline(pipelineIdFromUrl)
    }
  }, [pipelineIdFromUrl, selectedPipelineId, selectPipeline])

  // Mobile: garante que sempre haja uma etapa selecionada pra mostrar (a primeira, por padrão)
  useEffect(() => {
    if (stages.length === 0) return
    if (!activeMobileStageId || !stages.some(s => s.id === activeMobileStageId)) {
      setActiveMobileStageId(stages[0].id)
    }
  }, [stages, activeMobileStageId])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  // Ref for scroll detection
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const INITIAL_DISPLAY = 12
  const DISPLAY_INCREMENT = 10
  const [displayLimit, setDisplayLimit] = useState(INITIAL_DISPLAY)

  // Increase display limit when scrolling near the bottom of the page
  useEffect(() => {
    const el = scrollContainerRef.current?.closest('main') as HTMLElement | null
    if (!el) return

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight - scrollTop - clientHeight < 300) {
        setDisplayLimit(prev => prev + DISPLAY_INCREMENT)
      }
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Filter leads to only those belonging to the selected pipeline's stages
  const stageIds = useMemo(() => new Set(stages.map((s) => s.id)), [stages])

  // Helper function to check if lead matches date filter
  const matchesDateFilter = useCallback((lead: LeadWithOwner, dateRange: FilterState['dateRange']) => {
    const leadDate = new Date(lead.created_at)
    const now = new Date()

    switch (dateRange.type) {
      case 'all':
        return true // No date filtering

      case 'today':
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        return leadDate >= todayStart

      case 'this_week':
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - now.getDay()) // Start of week (Sunday)
        weekStart.setHours(0, 0, 0, 0)
        return leadDate >= weekStart

      case 'this_month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        return leadDate >= monthStart

      case 'custom':
        if (!dateRange.startDate || !dateRange.endDate) return true
        const start = new Date(dateRange.startDate)
        const end = new Date(dateRange.endDate)
        end.setHours(23, 59, 59, 999) // Include the end date
        return leadDate >= start && leadDate <= end

      default:
        return true
    }
  }, [])

  const pipelineLeads = useMemo(() => {
    let filtered = leads.filter((l) => l.stage_id && stageIds.has(l.stage_id))

    // Apply filters only if they are explicitly set
    if (filters) {
      // 1. Filter by integrations
      if (filters.integrations && filters.integrations.length > 0) {
        filtered = filtered.filter((l) =>
          l.integration_id && filters.integrations.includes(l.integration_id)
        )
      }

      // 2. Filter by sellers (owner_member_id)
      if (filters.sellers && filters.sellers.length > 0) {
        filtered = filtered.filter((l) =>
          l.owner_member_id && filters.sellers.includes(l.owner_member_id)
        )
      }

      // 3. Filter by stages
      if (filters.stages && filters.stages.length > 0) {
        filtered = filtered.filter((l) =>
          l.stage_id && filters.stages.includes(l.stage_id)
        )
      }

      // 4. Filter by date range
      if (filters.dateRange) {
        filtered = filtered.filter((l) => matchesDateFilter(l, filters.dateRange))
      }
    }

    return filtered
  }, [leads, stageIds, filters, matchesDateFilter])

  const leadsByStage = useMemo(() => {
    return stages.reduce(
      (acc, stage) => {
        acc[stage.id] = pipelineLeads.filter((l) => l.stage_id === stage.id)
        return acc
      },
      {} as Record<string, LeadWithOwner[]>
    )
  }, [stages, pipelineLeads])

  // Find which stage a lead belongs to
  const findStageForLead = useCallback(
    (leadId: string): string | undefined => {
      const lead = pipelineLeads.find((l) => l.id === leadId)
      return lead?.stage_id || undefined
    },
    [pipelineLeads]
  )

  // Custom collision detection: prefer pointerWithin, fallback to rectIntersection
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // First try pointerWithin — most accurate for the pointer position
      const pointerCollisions = pointerWithin(args)
      if (pointerCollisions.length > 0) {
        return pointerCollisions
      }
      // Fallback to rectIntersection for edge cases
      return rectIntersection(args)
    },
    []
  )

  function handleDragStart(event: DragStartEvent) {
    const leadId = event.active.id as string
    const lead = pipelineLeads.find((l) => l.id === leadId) || null
    setActiveLead(lead)
    setActiveLeadOriginalStage(lead?.stage_id || null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Determine the stage of the active item and the over item
    const activeStageId = findStageForLead(activeId)
    let overStageId: string | undefined

    if (stageIds.has(overId)) {
      // Over a stage column directly
      overStageId = overId
    } else {
      // Over another lead card
      overStageId = findStageForLead(overId)
    }

    if (!activeStageId || !overStageId) return

    // If dragging within the same stage, handle reordering
    if (activeStageId === overStageId && !stageIds.has(overId)) {
      setLeads((prev) => {
        const oldIndex = prev.findIndex((l) => l.id === activeId)
        const newIndex = prev.findIndex((l) => l.id === overId)

        if (oldIndex === -1 || newIndex === -1) return prev

        return arrayMove(prev, oldIndex, newIndex)
      })
      return
    }

    // Cross-stage move: update stage_id in local state (real-time visual feedback)
    if (activeStageId !== overStageId) {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === activeId ? { ...l, stage_id: overStageId! } : l
        )
      )
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over) {
      // Cancelled — revert to original stage
      if (activeLead && activeLeadOriginalStage) {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === activeLead.id ? { ...l, stage_id: activeLeadOriginalStage } : l
          )
        )
      }
      setActiveLead(null)
      setActiveLeadOriginalStage(null)
      return
    }

    const leadId = active.id as string
    const overId = over.id as string

    // Determine target stage
    let targetStageId: string
    if (stageIds.has(overId)) {
      targetStageId = overId
    } else {
      const targetLead = pipelineLeads.find((l) => l.id === overId)
      if (!targetLead?.stage_id) {
        setActiveLead(null)
        setActiveLeadOriginalStage(null)
        return
      }
      targetStageId = targetLead.stage_id
    }

    // If dropped in same stage as original, no DB update needed (already moved in state via onDragOver)
    if (targetStageId === activeLeadOriginalStage) {
      // Just reorder within the same stage — already handled by SortableContext visually
      setActiveLead(null)
      setActiveLeadOriginalStage(null)
      return
    }

    // Persist cross-stage move to database
    if (activeLeadOriginalStage) {
      moveLeadToStage(leadId, targetStageId, activeLeadOriginalStage)
    }

    setActiveLead(null)
    setActiveLeadOriginalStage(null)
  }

  const handleMoveLead = (targetStageId: string) => {
    if (!movingLead || !movingLead.stage_id) return
    moveLeadToStage(movingLead.id, targetStageId, movingLead.stage_id)
    setMovingLead(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner text="Carregando pipeline..." size="lg" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 pb-10">
      {/* Kanban Board */}
      <div
        ref={scrollContainerRef}
        className="flex-1 p-4"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {stages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] w-full -mt-8 text-center text-gray-500">
              <div className="bg-white p-8 rounded-2xl border border-dashed border-gray-300 max-w-md shadow-sm">
                <h3 className="text-xl font-bold text-gray-900 mb-3">Seu pipeline está vazio</h3>
                <p className="mb-6 text-sm">Não há etapas configuradas para este pipeline. Acesse as configurações para adicionar as colunas do seu funil de vendas.</p>
                <a href="/settings/pipelines" className="inline-flex items-center justify-center px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-sm">
                  Configurar Funil
                </a>
              </div>
            </div>
          ) : isMobile ? (
            <div>
              {/* Filtro — some do topo desktop no celular, então reaparece aqui */}
              <div className="mb-3">
                <FilterButton organizationId={organizationId} onFilterChange={setFilters} />
              </div>

              {/* Seletor de etapa — abas roláveis horizontalmente */}
              <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
                {stages.map(stage => {
                  const count = stageStats[stage.id]?.count ?? leadsByStage[stage.id]?.length ?? 0
                  const isActive = stage.id === activeMobileStageId
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setActiveMobileStageId(stage.id)}
                      className={`flex-shrink-0 px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
                        isActive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {stage.name} <span className="opacity-70">({count})</span>
                    </button>
                  )
                })}
              </div>

              {/* Uma etapa por vez — arrastar entre etapas não funciona bem no toque,
                  então mover um lead é feito clicando no card (abre "mover para"). */}
              {stages.filter(s => s.id === activeMobileStageId).map(stage => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  leads={leadsByStage[stage.id] || []}
                  organizationId={organizationId}
                  totalLeads={pipelineLeads.length}
                  isGoalsEnabled={isGoalsEnabled}
                  stageStats={stageStats[stage.id]}
                  displayLimit={displayLimit}
                  onLeadClick={setMovingLead}
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-4 pb-4 w-max mx-auto">
              {stages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  leads={leadsByStage[stage.id] || []}
                  organizationId={organizationId}
                  totalLeads={pipelineLeads.length}
                  isGoalsEnabled={isGoalsEnabled}
                  stageStats={stageStats[stage.id]}
                  displayLimit={displayLimit}
                />
              ))}
            </div>
          )}

          <DragOverlay
            dropAnimation={{
              duration: 200,
              easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {activeLead ? (
              <LeadCard
                lead={activeLead}
                organizationId={organizationId}
                isDragOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>

      </div>

      {/* Mobile: "mover para" — alternativa ao arrastar entre etapas */}
      {movingLead && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Mover lead</h2>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{movingLead.title}</p>
              </div>
              <button onClick={() => setMovingLead(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {stages.map(stage => (
                <button
                  key={stage.id}
                  onClick={() => handleMoveLead(stage.id)}
                  disabled={stage.id === movingLead.stage_id}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors ${
                    stage.id === movingLead.stage_id
                      ? 'text-gray-400 cursor-default'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {stage.name}{stage.id === movingLead.stage_id ? ' (etapa atual)' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
