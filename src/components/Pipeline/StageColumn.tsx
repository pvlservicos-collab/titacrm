'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { PipelineStage, LeadWithOwner, StageGoal } from '@/lib/types'
import { getStageColor } from '@/lib/stageColors'
import LeadCard from './LeadCard'
import { useMemo } from 'react'

interface StageColumnProps {
  stage: PipelineStage
  leads: LeadWithOwner[]
  organizationId: string
  totalLeads: number
  isGoalsEnabled: boolean
  stageStats?: { count: number; totalValue: number }
  displayLimit?: number
  /** Mobile: abre o seletor de "mover para" em vez de depender de arrastar. */
  onLeadClick?: (lead: LeadWithOwner) => void
}

export default function StageColumn({
  stage,
  leads,
  organizationId,
  totalLeads,
  isGoalsEnabled,
  stageStats,
  displayLimit,
  onLeadClick,
}: StageColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage.id })
  const fallbackColor = getStageColor(stage.rank)
  const stageColor = stage.color || fallbackColor.bar

  // Use DB stats for header display; fallback to loaded leads for backwards compatibility
  const displayCount = stageStats?.count ?? leads.length
  const displayValue = stageStats?.totalValue ?? leads.reduce((sum, lead) => sum + (lead.value || 0), 0)

  // Use target_volume from database or fallback to 0
  const goalLeads = stage.target_volume || 0
  const progressPercentage = goalLeads > 0 ? Math.min((displayCount / goalLeads) * 100, 100) : 0

  // Slice leads to respect the per-stage display limit
  const visibleLeads = displayLimit ? leads.slice(0, displayLimit) : leads

  // Memoize item ids to prevent SortableContext from infinite re-rendering
  const itemIds = useMemo(() => visibleLeads.map((l) => l.id), [visibleLeads])

  return (
    <div
      ref={setNodeRef}
      className="flex-shrink-0 w-full md:w-[280px] flex flex-col"
    >
      {/* Stage Header */}
      <div className="mb-3 px-2">
        <div className="flex items-center justify-between mb-0.5">
          <h3
            className="uppercase font-bold text-[12.5px] tracking-wider transition-colors"
            style={{ color: stageColor }}
          >
            {stage.name}
          </h3>
          <button className="text-gray-300 hover:text-gray-500 p-1 rounded transition-colors focus:outline-none">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
        </div>

        <div className="flex items-baseline gap-1 text-[11px] text-gray-400 font-medium">
          <span className="text-[17px] font-black text-gray-900 leading-none">
            {displayCount.toString().padStart(2, '0')}
          </span>
          <span>
            leads • R$ {displayValue.toLocaleString('pt-BR')}
          </span>
        </div>
        {/* Progress bar / Underline */}
        {isGoalsEnabled && goalLeads > 0 ? (
          <div className="w-full h-[3px] bg-gray-200/60 rounded-full overflow-hidden mt-3 mb-1">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPercentage}%`,
                backgroundColor: stageColor,
              }}
            />
          </div>
        ) : (
          <div
            className="w-full h-[2px] rounded-full mt-3 mb-1 opacity-20"
            style={{ backgroundColor: stageColor }}
          />
        )}
      </div>

      {/* Leads List */}
      <SortableContext
        items={itemIds}
        strategy={verticalListSortingStrategy}
      >
        <div
          className="space-y-3 min-h-[200px] flex-1 px-1"
        >
          {visibleLeads.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Sem leads
            </div>
          ) : (
            visibleLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                organizationId={organizationId}
                stageColor={stageColor}
                onClick={onLeadClick ? () => onLeadClick(lead) : undefined}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
