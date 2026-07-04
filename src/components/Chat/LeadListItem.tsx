'use client'

import { memo } from 'react'
import { LeadWithOwner, SearchHit } from '@/lib/types'
import { Robot, PushPin } from '@phosphor-icons/react'
import { getInitials, formatPhone, renderSnippet } from '@/lib/utils'
import IntegrationBadge from '@/components/Shared/IntegrationBadge'
import { PAYMENT_STATUS_META, TONE_STYLES } from '@/lib/orderStatus'

interface LeadListItemProps {
    lead: LeadWithOwner
    isSelected: boolean
    onClick: (lead: LeadWithOwner) => void
    onContextMenu: (e: React.MouseEvent, lead: LeadWithOwner) => void
    timeStr: string
    hit?: SearchHit
    query?: string
    hideReplyHighlight?: boolean
}

const PAYMENT_METHOD_TAGS: Record<string, { label: string; style: React.CSSProperties }> = {
    pix: { label: 'PIX', style: { backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80' } },
    credit_card: { label: 'Cartão', style: { backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' } },
    boleto: { label: 'Boleto', style: { backgroundColor: 'rgba(251,146,60,0.15)', color: '#fb923c' } },
    dinheiro: { label: 'Dinheiro', style: { backgroundColor: 'rgba(52,211,153,0.15)', color: '#34d399' } },
}

const PAYMENT_STATUS_TAGS: Record<string, { label: string; style: React.CSSProperties }> = Object.fromEntries(
    Object.entries(PAYMENT_STATUS_META).map(([value, meta]) => [value, { label: meta.label, style: TONE_STYLES[meta.tone] }])
)

const LeadListItem = ({ lead, isSelected, onClick, onContextMenu, timeStr, hit, query, hideReplyHighlight }: LeadListItemProps) => {
    const defaultMsg = lead.last_activity_type ? 'Ver conversa' : 'Sem mensagens'
    const lastMsg = lead.last_message_content || defaultMsg

    const orderPaymentMethod = lead.custom_attributes?.last_order_payment_method as string | undefined
    const orderPaymentStatus = lead.custom_attributes?.last_order_payment_status as string | undefined

    let SenderIcon = null
    let iconColor = ''

    if (lead.last_message_sender_type === 'ai' || lead.last_message_sender_type === 'ai_agent') {
        SenderIcon = Robot
        iconColor = 'text-violet-600'
    }

    const unreadGradient = lead.is_unread
        ? (lead.last_message_sender_type === 'lead'
            ? 'linear-gradient(to right, rgba(34,197,94,0.5), transparent 80%)'
            : 'linear-gradient(to right, rgba(59,130,246,0.5), transparent 80%)')
        : (lead.last_message_sender_type === 'human' && !hideReplyHighlight
            ? 'linear-gradient(to right, rgba(45,212,191,0.35), transparent 80%)'
            : undefined)

    return (
        <div className="w-full flex-shrink-0 relative">
            <button
                onClick={() => onClick(lead)}
                onContextMenu={(e) => onContextMenu(e, lead)}
                className={`w-full text-left px-4 py-3 border-b border-[#1f2c33] transition-colors ${isSelected
                    ? 'bg-[#2a3942] border-l-[3px] border-l-[#53bdeb]'
                    : 'hover:bg-[#182229] border-l-[3px] border-l-transparent'
                    }`}
                style={unreadGradient ? { background: unreadGradient } : undefined}
            >
                <div className="flex items-center gap-3 w-full">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                        {lead.is_pinned && (
                            <div className="absolute -top-1 -left-1 z-10 bg-[#111b21] rounded-full p-[1px]">
                                <PushPin size={12} weight="fill" className="text-[#53bdeb] -rotate-45" />
                            </div>
                        )}
                        <div className="w-10 h-10 rounded-full bg-[#2a3942] flex items-center justify-center overflow-hidden border border-[#1f2c33]">
                            {lead.avatar_url ? (
                                <img src={lead.avatar_url} alt={lead.title} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-sm font-bold text-[#53bdeb]">{getInitials(lead.title)}</span>
                            )}
                        </div>
                        <IntegrationBadge lead={lead} size="sm" />
                    </div>

                    {/* Text Content */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-start justify-between mb-[2px] w-full">
                            <h3 className={`text-[15px] leading-tight truncate ${lead.is_unread ? 'font-bold text-[#e9edef]' : 'font-medium text-[#d1d7db]'}`}>
                                {formatPhone(lead.title)}
                            </h3>
                            <div className="flex items-center gap-2 pl-2">
                                {lead.is_unread && (
                                    <div className="w-2 h-2 rounded-full bg-[#53bdeb] flex-shrink-0" />
                                )}
                                <span className={`text-[11px] flex-shrink-0 ${lead.is_unread ? 'text-[#53bdeb] font-bold' : 'text-[#667781] font-medium'}`}>
                                    {timeStr}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 overflow-hidden w-full">
                            {SenderIcon && <SenderIcon weight="fill" className={`flex-shrink-0 ${iconColor} w-3.5 h-3.5`} />}
                            <p className={`text-[13px] truncate ${lead.is_unread ? 'text-[#d1d7db] font-medium' : (lastMsg ? 'text-[#8696a0]' : 'text-[#667781] italic')}`}>
                                {lastMsg}
                            </p>
                        </div>

                        {hit?.matchType === 'message' && hit.snippet && (
                            <div className="text-xs text-[#8696a0] italic mt-0.5 line-clamp-1">
                                <span className="text-[#53bdeb] mr-1">↩</span>
                                <span dangerouslySetInnerHTML={{ __html: renderSnippet(hit.snippet, query ?? '') }} />
                            </div>
                        )}

                        {/* Channel tag + order status tags + lead tags */}
                        {(lead.integration_id || orderPaymentMethod || (lead.lead_tags && lead.lead_tags.length > 0)) && (
                            <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                                {lead.integration_id && (
                                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                                        Nº 2
                                    </span>
                                )}
                                {orderPaymentMethod && PAYMENT_METHOD_TAGS[orderPaymentMethod] && (
                                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0" style={PAYMENT_METHOD_TAGS[orderPaymentMethod].style}>
                                        {PAYMENT_METHOD_TAGS[orderPaymentMethod].label}
                                    </span>
                                )}
                                {orderPaymentStatus && PAYMENT_STATUS_TAGS[orderPaymentStatus] && (
                                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0" style={PAYMENT_STATUS_TAGS[orderPaymentStatus].style}>
                                        {PAYMENT_STATUS_TAGS[orderPaymentStatus].label}
                                    </span>
                                )}
                                {lead.lead_tags && lead.lead_tags.map((lt: any) => {
                                    const tag = lt.tag
                                    if (!tag) return null
                                    const isHex = tag.color?.startsWith('#')
                                    return (
                                        <span
                                            key={lt.tag_id}
                                            className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex items-center gap-1 ${!isHex ? tag.color : ''}`}
                                            style={isHex ? { backgroundColor: tag.color + '1A', color: tag.color } : {}}
                                        >
                                            {tag.name}
                                        </span>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </button>
        </div>
    )
}

export default memo(LeadListItem, (prevProps, nextProps) => {
    return (
        prevProps.lead.id === nextProps.lead.id &&
        prevProps.lead.updated_at === nextProps.lead.updated_at &&
        prevProps.lead.is_unread === nextProps.lead.is_unread &&
        prevProps.lead.last_message_sender_type === nextProps.lead.last_message_sender_type &&
        prevProps.lead.integration_id === nextProps.lead.integration_id &&
        prevProps.lead.custom_attributes?.last_order_payment_status === nextProps.lead.custom_attributes?.last_order_payment_status &&
        prevProps.lead.custom_attributes?.last_order_payment_method === nextProps.lead.custom_attributes?.last_order_payment_method &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.hideReplyHighlight === nextProps.hideReplyHighlight &&
        prevProps.timeStr === nextProps.timeStr &&
        prevProps.query === nextProps.query &&
        prevProps.hit?.matchType === nextProps.hit?.matchType &&
        prevProps.hit?.snippet === nextProps.hit?.snippet
    )
})
