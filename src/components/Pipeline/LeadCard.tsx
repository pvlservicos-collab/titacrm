'use client'

import { memo } from 'react'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Info } from '@phosphor-icons/react'
import { LeadWithOwner } from '@/lib/types'
import { formatPhone } from '@/lib/utils'
import Avatar from '@/components/Shared/Avatar'
import IntegrationBadge from '@/components/Shared/IntegrationBadge'

interface LeadCardProps {
  lead: LeadWithOwner
  organizationId: string
  isDragOverlay?: boolean
  stageColor?: string
  onClick?: () => void
  /** Abre os detalhes do lead — separado do onClick porque no mobile o card inteiro já
   * é usado pra abrir "mover para etapa" (arrastar é ruim no touch); esse botão dá um
   * jeito de ver/editar informações sem competir com aquele clique. */
  onInfoClick?: () => void
}

const LeadCard = ({ lead, isDragOverlay, stageColor, onClick, onInfoClick }: LeadCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  })

  // Format phone if it falls back to it
  const formattedPhone = lead.phone ? formatPhone(lead.phone) : ''
  const description = lead.last_message_content || lead.ai_next_action_short || lead.email || formattedPhone || ''



  const style = isDragOverlay
    ? undefined
    : {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
      '--stage-color': stageColor,
    } as React.CSSProperties & { '--stage-color'?: string }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={style}
      className={`
        bg-white border border-gray-200 rounded-lg p-4 transition-all relative overflow-hidden
        outline-none focus:outline-none focus-visible:outline-none
        ${isDragOverlay
          ? 'shadow-xl rotate-2 scale-105 cursor-grabbing'
          : 'shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing group'
        }
      `}
    >
      {/* Left colored border on hover - 4px width */}
      {!isDragOverlay && stageColor && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ backgroundColor: stageColor }}
        />
      )}

      <div className="flex gap-3 relative z-10 w-full">
        {/* Avatar */}
        <Avatar
          name={lead.title || 'Unknown'}
          imageUrl={lead.avatar_url}
          size="sm"
          className="flex-shrink-0 mt-0.5"
          badge={<IntegrationBadge lead={lead} size="sm" />}
        />

        {/* Detail Column */}
        <div className="flex-1 min-w-0 flex flex-col pt-0.5">
          {/* Header row */}
          <div className="flex items-start justify-between mb-0.5">
            <h4 className="font-semibold text-sm text-gray-900 truncate pr-2">
              {formatPhone(lead.title)}
            </h4>
            {onInfoClick && !isDragOverlay && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onInfoClick()
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-full p-0.5 flex-shrink-0 transition-colors"
                title="Ver detalhes do lead"
              >
                <Info size={16} />
              </button>
            )}
          </div>

          {/* Last message row */}
          <div className="text-[12px] text-gray-500 mb-2 truncate">
            {description}
          </div>

          {/* Tags */}
          {lead.lead_tags && lead.lead_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {lead.lead_tags.slice(0, 3).map((lt) => (
                <span
                  key={lt.tag_id}
                  className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide"
                  style={{
                    backgroundColor: lt.tag.color + '1A',
                    color: lt.tag.color,
                  }}
                >
                  {lt.tag.name}
                </span>
              ))}
              {lead.lead_tags.length > 3 && (
                <span className="text-[10px] text-gray-400 self-center">
                  +{lead.lead_tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(LeadCard, (prevProps, nextProps) => {
  return (
    prevProps.lead.id === nextProps.lead.id &&
    prevProps.lead.updated_at === nextProps.lead.updated_at &&
    prevProps.isDragOverlay === nextProps.isDragOverlay &&
    prevProps.stageColor === nextProps.stageColor &&
    prevProps.lead.stage_id === nextProps.lead.stage_id
  )
})
