'use client'

import { useRef, useEffect, useState } from 'react'
import { Sparkle, X, MagnifyingGlassPlus, Play, Pause, Microphone, ArrowBendUpLeft, Check, WarningCircle, Lightning, PushPin } from '@phosphor-icons/react'
import { LeadActivityWithActor, LeadWithOwner } from '@/lib/types'
import { formatTime } from '@/lib/utils'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'

interface ActivityTimelineProps {
  activities: LeadActivityWithActor[]
  loading: boolean
  lead: LeadWithOwner
  onReply?: (activity: LeadActivityWithActor) => void
  onTogglePin?: (activity: LeadActivityWithActor) => void
  pinnedActivityIds?: Set<string>
}

// ── Date helpers ──
const WEEKDAYS_PT = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
]

function getDateLabel(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - target.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'
  if (diffDays >= 2 && diffDays <= 6) return WEEKDAYS_PT[target.getDay()]

  const d = String(target.getDate()).padStart(2, '0')
  const m = String(target.getMonth() + 1).padStart(2, '0')
  const y = target.getFullYear()
  return `${d}/${m}/${y}`
}

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// ── Determine sender type ──
type SenderType = 'lead' | 'ai' | 'user' | 'automated' | 'system_other'

function getSenderType(activity: LeadActivityWithActor): SenderType {
  if (activity.type === 'note' || activity.type === 'call' || activity.type === 'email') return 'system_other'

  if (activity.metadata?.direction === 'inbound') return 'lead'

  if (activity.metadata?.automated) return 'automated'

  if (activity.metadata?.source === 'ai' || activity.metadata?.source === 'ai_agent' || activity.type === 'system') return 'ai'

  return 'user'
}

function isOutgoing(senderType: SenderType): boolean {
  return senderType === 'ai' || senderType === 'user' || senderType === 'automated'
}

// ── Date Divider ──
function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-3">
      <span className="text-[11px] font-semibold text-[var(--chat-text-muted)] bg-[var(--chat-bg-panel)]/90 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-sm border border-white/5">
        {label}
      </span>
    </div>
  )
}

// ── Custom Audio Player ──
function CustomAudioPlayer({ url, isOutgoing, senderAvatar }: { url: string; isOutgoing: boolean, senderAvatar?: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const formatAudioTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`flex items-center gap-3 min-w-[220px] max-w-[320px] p-1.5 ${isOutgoing ? '' : ''}`}>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      <button onClick={togglePlay} className={`${isOutgoing ? 'text-white' : 'text-[var(--chat-icon)]'} hover:opacity-80 flex-shrink-0 transition-opacity`}>
        {isPlaying ? <Pause size={28} weight="fill" /> : <Play size={28} weight="fill" />}
      </button>

      <div className="flex-1 flex flex-col justify-center min-w-0 mr-2">
        <div className="relative w-full h-8 flex items-center">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              if (audioRef.current) {
                audioRef.current.currentTime = Number(e.target.value);
                setCurrentTime(Number(e.target.value));
              }
            }}
            className="absolute z-10 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: isOutgoing ? 'rgba(255,255,255,0.3)' : 'var(--chat-border)' }}>
            <div
              className="h-full"
              style={{ width: `${progressPercent}%`, backgroundColor: isOutgoing ? '#fff' : 'var(--chat-accent)' }}
            />
          </div>
          <div
            className="absolute pointer-events-none rounded-full"
            style={{
              left: `calc(${progressPercent}% - 6px)`,
              width: '12px',
              height: '12px',
              backgroundColor: isOutgoing ? '#fff' : 'var(--chat-accent)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }}
          />
        </div>
        <div className="flex justify-start -mt-1.5">
          <span className={`text-[11px] font-medium ${isOutgoing ? 'text-white/80' : 'text-[var(--chat-text-muted)]'}`}>
            {formatAudioTime(currentTime || duration)}
          </span>
        </div>
      </div>

      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center border border-black/5 bg-[var(--chat-bg-hover)]">
          {senderAvatar ? (
            <img src={senderAvatar} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${isOutgoing ? 'bg-blue-100' : 'bg-[var(--chat-bg-hover)]'}`}>
              <span className={`text-[10px] font-bold ${isOutgoing ? 'text-blue-500' : 'text-[var(--chat-text-muted)]'}`}>👤</span>
            </div>
          )}
        </div>
        <div className="absolute -bottom-1 -left-1 rounded-full p-0.5 shadow-sm" style={{ backgroundColor: isOutgoing ? '#21BCED' : 'var(--chat-bg-hover)' }}>
          <Microphone size={12} weight="fill" className={isOutgoing ? "text-white" : "text-[var(--chat-accent)]"} />
        </div>
      </div>
    </div>
  )
}

// ── Media Renderer ──
function MediaRenderer({ metadata, isOutgoing, onImageClick, senderAvatar }: { metadata: any, isOutgoing: boolean, onImageClick?: (url: string) => void, senderAvatar?: string }) {
  if (!metadata?.media_url) return null;

  const url = metadata.media_url;
  const type = metadata.media_type;

  // Audio
  if (type === 'audio') {
    return <CustomAudioPlayer url={url} isOutgoing={isOutgoing} senderAvatar={senderAvatar} />;
  }

  // Image & Sticker
  if (type === 'image' || type === 'sticker') {
    const isSticker = type === 'sticker';
    return (
      <div className={`mt-1 mb-1 rounded-lg overflow-hidden relative cursor-pointer group ${isSticker ? 'max-w-[120px] bg-transparent' : ''}`}>
        <img
          src={url}
          alt={isSticker ? "Figurinha de Chat" : "Mídia de Chat"}
          className={`${isSticker ? 'w-full h-auto drop-shadow-sm' : 'max-w-[240px] max-h-[240px] sm:max-w-[300px] border border-black/5 rounded-lg'} object-contain`}
        />
        {!isSticker && (
          <button
            onClick={() => onImageClick?.(url)}
            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg w-full h-full"
          >
            <span className="text-white bg-black/60 px-3 py-1.5 rounded text-xs backdrop-blur-sm shadow flex items-center gap-1.5">
              <MagnifyingGlassPlus size={16} /> Ampliar
            </span>
          </button>
        )}
        {isSticker && (
          <button
            onClick={() => onImageClick?.(url)}
            className="absolute inset-0 bg-transparent opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg w-full h-full"
          >
            <div className="bg-black/60 rounded-full p-2 backdrop-blur-sm shadow-sm scale-75">
              <MagnifyingGlassPlus size={16} weight="bold" className="text-white" />
            </div>
          </button>
        )}
      </div>
    );
  }

  // Video
  if (type === 'video') {
    return (
      <div className="mt-1 mb-1 rounded-lg overflow-hidden bg-black/10">
        <video
          controls
          src={url}
          className="max-w-[240px] max-h-[240px] sm:max-w-[300px] object-contain rounded-lg"
        />
      </div>
    );
  }

  // Document (PDF etc)
  if (type === 'document') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-1 mb-1 flex items-center gap-3 p-3 rounded-lg border ${isOutgoing ? 'bg-black/10 border-white/20 hover:bg-black/20 text-white' : 'bg-[var(--chat-bg-hover)] border-[var(--chat-border)] hover:bg-[var(--chat-bg-hover)] text-[var(--chat-text-primary)]'
          } transition-colors max-w-[240px]`}
        title="Baixar Documento"
      >
        <div className={`p-2 rounded ${isOutgoing ? 'bg-white/20' : 'bg-[var(--chat-bg-hover)] shadow-sm'}`}>
          <span className="text-lg">📄</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{metadata.media_filename || 'Documento'}</p>
          <p className={`text-[10px] ${isOutgoing ? 'text-white/70' : 'text-[var(--chat-text-muted)]'} uppercase mt-0.5 tracking-wider`}>
            {metadata.media_mimetype?.split('/')[1] || 'FILE'}
          </p>
        </div>
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
      Abrir Arquivo ({type})
    </a>
  );
}

// ── Quoted Message Bar (WhatsApp-style reply preview) ──
function QuotedMessageBar({ metadata, isOutgoing }: { metadata: any; isOutgoing: boolean }) {
  const quotedText = metadata?.quoted_text;
  const quotedMediaType = metadata?.quoted_media_type;
  const quotedMediaUrl = metadata?.quoted_media_url;
  const quotedSender = metadata?.quoted_sender;

  if (!quotedText && !quotedMediaType) return null;

  // Color for the left bar: blue accent for lead replies, white-ish for outgoing
  const barColor = isOutgoing ? 'rgba(255,255,255,0.5)' : 'var(--chat-accent)';
  const bgColor = isOutgoing ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)';
  const textColor = isOutgoing ? 'text-white/90' : 'text-[var(--chat-text-secondary)]';
  const senderColor = isOutgoing ? 'text-white font-semibold' : 'text-[var(--chat-accent)] font-semibold';

  return (
    <div
      className="rounded-lg mb-1.5 overflow-hidden cursor-pointer"
      style={{ backgroundColor: bgColor }}
    >
      <div className="flex min-h-[40px]">
        {/* Colored left bar */}
        <div className="w-1 flex-shrink-0 rounded-l" style={{ backgroundColor: barColor }} />

        {/* Quote content */}
        <div className="flex-1 px-2.5 py-1.5 min-w-0">
          {quotedSender && (
            <p className={`text-[11px] ${senderColor} truncate mb-0.5`}>
              {quotedSender}
            </p>
          )}
          <p className={`text-[12px] ${textColor} line-clamp-2 leading-snug opacity-80`}>
            {quotedText || ''}
          </p>
        </div>

        {/* Quoted media thumbnail */}
        {quotedMediaUrl && (quotedMediaType === 'image' || quotedMediaType === 'video' || quotedMediaType === 'sticker') && (
          <div className="w-[46px] h-[46px] flex-shrink-0 overflow-hidden rounded-r">
            <img
              src={quotedMediaUrl}
              alt="Mídia citada"
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message Bubble ──
function MessageBubble({
  activity,
  senderType,
  showHeader,
  lead,
  reactions,
  onImageClick,
  onReply,
  onTogglePin,
  isPinned
}: {
  activity: LeadActivityWithActor
  senderType: SenderType | 'system_other'
  showHeader: boolean
  lead: LeadWithOwner
  reactions?: LeadActivityWithActor[]
  onImageClick?: (url: string) => void
  onReply?: (activity: LeadActivityWithActor) => void
  onTogglePin?: (activity: LeadActivityWithActor) => void
  isPinned?: boolean
}) {
  if (senderType === 'system_other') {
    // Other types, we handled in main loop
    return null
  }

  const outgoing = isOutgoing(senderType)

  if (outgoing) {
    const isAI = senderType === 'ai'
    const isAutomated = senderType === 'automated'
    const bubbleColor = isAI ? 'rgba(75, 59, 253, 0.85)' : isAutomated ? 'rgba(34, 197, 94, 0.85)' : 'rgba(33, 188, 237, 0.85)'
    const labelColor = isAI ? '#4B3BFD' : isAutomated ? '#16A34A' : '#21BCED'
    const label = isAI ? 'Atlas AI' : isAutomated ? 'Automático' : 'Você'

    return (
      <div className="flex flex-col items-end group/msg max-w-[65%] w-fit ml-auto">
        {showHeader && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold" style={{ color: labelColor }}>
              {label}
            </span>
            {isAI ? (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#4B3BFD' }}
              >
                <Sparkle size={12} weight="fill" className="text-white" />
              </div>
            ) : isAutomated ? (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#16A34A' }}
              >
                <Lightning size={12} weight="fill" className="text-white" />
              </div>
            ) : (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: '#21BCED' }}
              >
                {activity.actor?.profiles?.avatar_url ? (
                  <img src={activity.actor.profiles.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[9px] font-bold text-white">
                    {(activity.actor?.profiles?.full_name?.charAt(0) || 'V').toUpperCase()}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        <div className="relative">
          {/* Reply/Pin buttons — outgoing (appear on left) */}
          {(onTogglePin || onReply) && (
            <div className="absolute -left-9 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-20">
              {onTogglePin && (
                <button
                  onClick={() => onTogglePin(activity)}
                  className="w-7 h-7 rounded-full bg-[var(--chat-bg-menu)] border border-[var(--chat-border)] shadow-sm flex items-center justify-center hover:bg-[var(--chat-bg-hover)]"
                  title={isPinned ? 'Desafixar mensagem' : 'Fixar mensagem'}
                >
                  <PushPin size={14} weight={isPinned ? 'fill' : 'bold'} className={isPinned ? 'text-[var(--chat-accent)] -rotate-45' : 'text-[var(--chat-icon)]'} />
                </button>
              )}
              {onReply && (
                <button
                  onClick={() => onReply(activity)}
                  className="w-7 h-7 rounded-full bg-[var(--chat-bg-menu)] border border-[var(--chat-border)] shadow-sm flex items-center justify-center hover:bg-[var(--chat-bg-hover)]"
                  title="Responder"
                >
                  <ArrowBendUpLeft size={14} weight="bold" className="text-[var(--chat-icon)]" />
                </button>
              )}
            </div>
          )}
          <div
            className={`relative rounded-2xl px-3 pt-2 pb-1.5 min-w-[80px] ${showHeader ? 'rounded-tr-[2px]' : ''}`}
            style={{ backgroundColor: bubbleColor }}
          >
            <QuotedMessageBar metadata={activity.metadata} isOutgoing={true} />
            {activity.metadata?.media_url && (
              <MediaRenderer metadata={activity.metadata} isOutgoing={true} onImageClick={onImageClick} senderAvatar={isAI ? undefined : activity.actor?.profiles?.avatar_url} />
            )}
            {(!activity.metadata?.media_url || !['📷 Imagem', '🎥 Vídeo', '🎵 Áudio', '📄 Documento', '✨ Figurinha'].includes(activity.content)) && (
              <p className={`text-sm text-white leading-relaxed whitespace-pre-wrap break-words ${activity.metadata?.media_url ? 'mt-1' : ''}`}>
                {activity.content}
                <span className="inline-block w-[2.5rem]" />
              </p>
            )}
            <span className="absolute bottom-1 right-2.5 text-[10px] text-white/70 whitespace-nowrap flex items-center gap-1">
              {formatTime(activity.created_at)}
              {activity.metadata?.send_status === 'failed' ? (
                <span title={activity.metadata?.send_error || 'Falha ao enviar'}>
                  <WarningCircle size={13} weight="fill" className="text-red-300" />
                </span>
              ) : activity.metadata?.send_status === 'sent' ? (
                <Check size={13} weight="bold" className="text-white/70" />
              ) : null}
            </span>
          </div>

          {/* Reaction Pill Outgoing */}
          {reactions && reactions.length > 0 && (
            <div
              className="absolute -bottom-2 right-2 bg-[var(--chat-bg-menu)] border border-[var(--chat-border)] shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 z-10"
              title={reactions.map(r => `${r.metadata?.sender_name || 'Desconhecido'}: ${r.content}`).join('\n')}
            >
              {Array.from(new Set(reactions.map(r => r.content))).map((emoji, idx) => (
                <span key={idx} className="text-[12px] leading-none">{emoji}</span>
              ))}
              {reactions.length > 1 && <span className="text-[var(--chat-text-muted)] font-medium text-[10px] ml-0.5">{reactions.length}</span>}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Lead — left side
  const senderName = activity.metadata?.sender_name || activity.actor?.profiles?.full_name || lead.title || 'Lead'
  const initials = senderName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const isEvolution = activity.metadata?.source === 'evolution'

  return (
    <div className="flex items-start gap-2.5 group/msg">
      <div className="w-7 flex-shrink-0 mt-0.5">
        {showHeader && (
          <div className="w-7 h-7 rounded-full bg-[var(--chat-bg-hover)] flex items-center justify-center shadow-inner overflow-hidden border border-[var(--chat-bg-hover)]">
            {lead.avatar_url ? (
              <img src={lead.avatar_url} alt={lead.title} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-bold text-[var(--chat-accent)]">{initials}</span>
            )}
          </div>
        )}
      </div>
      <div className="max-w-[65%] w-fit">
        {showHeader && (
          <div className="flex items-center gap-1.5 mb-1 ml-1">
            <span className="text-xs font-semibold text-[var(--chat-text-muted)]">{senderName}</span>
            {isEvolution && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                Nº 2
              </span>
            )}
          </div>
        )}
        <div className="relative">
          {/* Reply/Pin buttons — inbound (appear on right) */}
          {(onTogglePin || onReply) && (
            <div className="absolute -right-9 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-20">
              {onTogglePin && (
                <button
                  onClick={() => onTogglePin(activity)}
                  className="w-7 h-7 rounded-full bg-[var(--chat-bg-menu)] border border-[var(--chat-border)] shadow-sm flex items-center justify-center hover:bg-[var(--chat-bg-hover)]"
                  title={isPinned ? 'Desafixar mensagem' : 'Fixar mensagem'}
                >
                  <PushPin size={14} weight={isPinned ? 'fill' : 'bold'} className={isPinned ? 'text-[var(--chat-accent)] -rotate-45' : 'text-[var(--chat-icon)]'} />
                </button>
              )}
              {onReply && (
                <button
                  onClick={() => onReply(activity)}
                  className="w-7 h-7 rounded-full bg-[var(--chat-bg-menu)] border border-[var(--chat-border)] shadow-sm flex items-center justify-center hover:bg-[var(--chat-bg-hover)]"
                  title="Responder"
                >
                  <ArrowBendUpLeft size={14} weight="bold" className="text-[var(--chat-icon)]" />
                </button>
              )}
            </div>
          )}
          <div
            className={`relative rounded-2xl px-3 pt-2 pb-1.5 border shadow-sm min-w-[80px] ${showHeader ? 'rounded-tl-[2px]' : ''}`}
            style={isEvolution
              ? { backgroundColor: '#1e1a2e', borderColor: 'rgba(139,92,246,0.2)' }
              : { backgroundColor: 'var(--chat-bg-field)', borderColor: 'rgba(255,255,255,0.05)' }
            }
          >
            <QuotedMessageBar metadata={activity.metadata} isOutgoing={false} />
            {activity.metadata?.media_url && (
              <MediaRenderer metadata={activity.metadata} isOutgoing={false} onImageClick={onImageClick} senderAvatar={lead.avatar_url} />
            )}
            {(!activity.metadata?.media_url || !['📷 Imagem', '🎥 Vídeo', '🎵 Áudio', '📄 Documento', '✨ Figurinha'].includes(activity.content)) && (
              <p className={`text-sm text-[var(--chat-text-primary)] leading-relaxed whitespace-pre-wrap break-words ${activity.metadata?.media_url ? 'mt-1' : ''}`}>
                {activity.content}
                <span className="inline-block w-[2.5rem]" />
              </p>
            )}
            <span className="absolute bottom-1 right-2.5 text-[10px] text-[var(--chat-text-muted)] whitespace-nowrap">
              {formatTime(activity.created_at)}
            </span>
          </div>

          {/* Reaction Pill Inbound */}
          {reactions && reactions.length > 0 && (
            <div
              className="absolute -bottom-2 right-2 bg-[var(--chat-bg-menu)] border border-[var(--chat-border)] shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 z-10"
              title={reactions.map(r => `${r.metadata?.sender_name || 'Desconhecido'}: ${r.content}`).join('\n')}
            >
              {Array.from(new Set(reactions.map(r => r.content))).map((emoji, idx) => (
                <span key={idx} className="text-[12px] leading-none">{emoji}</span>
              ))}
              {reactions.length > 1 && <span className="text-[var(--chat-text-muted)] font-medium text-[10px] ml-0.5">{reactions.length}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──
export default function ActivityTimeline({
  activities,
  loading,
  lead,
  onReply,
  onTogglePin,
  pinnedActivityIds,
}: ActivityTimelineProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activities.length])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner text="Carregando mensagens..." />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent z-10 relative">
        <div className="bg-[var(--chat-bg-panel)] border border-white/5 rounded-full px-6 py-2.5 text-[13px] text-[var(--chat-text-muted)] shadow-sm">
          Nenhuma mensagem ainda. Inicie a conversa!
        </div>
      </div>
    )
  }

  // Pre-process reactions
  const normalActivities: LeadActivityWithActor[] = []
  const reactionMap = new Map<string, LeadActivityWithActor[]>()

  activities.forEach(act => {
    // Skip rename events from appearing in the chat timeline (they only go to the History panel)
    if (act.type === 'system' && act.metadata?.source === 'rename') {
      return
    }

    if (act.metadata?.is_reaction && act.metadata?.target_message_id) {
      const targetId = act.metadata.target_message_id
      if (!reactionMap.has(targetId)) {
        reactionMap.set(targetId, [])
      }
      reactionMap.get(targetId)!.push(act)
    } else {
      normalActivities.push(act)
    }
  })

  // Start building elements
  const elements: React.ReactNode[] = []
  let lastDateKey = ''
  let lastSenderType = ''
  let lastSenderName = ''

  normalActivities.forEach((activity, i) => {
    const senderType = getSenderType(activity)
    const date = new Date(activity.created_at)
    const dateKey = getDateKey(date)

    // Note
    if (activity.type === 'note') {
      if (dateKey !== lastDateKey) {
        elements.push(<DateDivider key={`date-${dateKey}-${i}`} label={getDateLabel(date)} />)
        lastDateKey = dateKey
        lastSenderType = ''
        lastSenderName = ''
      }
      elements.push(
        <div key={activity.id} className="mt-4 flex justify-center">
          <div className="bg-amber-50 dark:bg-[#3a2e12] border border-amber-200 dark:border-[#5a4720] rounded-2xl p-3 max-w-sm w-full shadow-sm">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">📝 Nota</p>
            <p className="text-sm text-amber-900/90 dark:text-amber-100/90 mt-1 whitespace-pre-wrap">{activity.content}</p>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-2 text-right uppercase font-semibold tracking-wider">
              {activity.actor?.profiles?.full_name || 'Desconhecido'} • {formatTime(activity.created_at)}
            </p>
          </div>
        </div>
      )
      lastSenderType = 'system_other'
      lastSenderName = ''
      return
    }

    // Call
    if (activity.type === 'call') {
      if (dateKey !== lastDateKey) {
        elements.push(<DateDivider key={`date-${dateKey}-${i}`} label={getDateLabel(date)} />)
        lastDateKey = dateKey
        lastSenderType = ''
        lastSenderName = ''
      }
      const durationSecs = activity.metadata?.duration_seconds
      const durationStr = durationSecs
        ? `${Math.floor(durationSecs / 60)}min ${durationSecs % 60}s`
        : ''
      elements.push(
        <div key={activity.id} className="mt-4 flex justify-center mb-1">
          <div className="bg-[var(--chat-bg-field)] border border-[var(--chat-border)] shadow-sm rounded-full py-2 px-5 inline-block">
            <p className="text-xs font-semibold text-[var(--chat-text-secondary)] uppercase tracking-widest">
              📞 Ligação{durationStr ? ` • ${durationStr}` : ''} • <span className="text-[var(--chat-text-muted)] font-normal">{formatTime(activity.created_at)}</span>
            </p>
          </div>
        </div>
      )
      lastSenderType = 'system_other'
      lastSenderName = ''
      return
    }

    // Email
    if (activity.type === 'email') {
      if (dateKey !== lastDateKey) {
        elements.push(<DateDivider key={`date-${dateKey}-${i}`} label={getDateLabel(date)} />)
        lastDateKey = dateKey
        lastSenderType = ''
        lastSenderName = ''
      }
      elements.push(
        <div key={activity.id} className="mt-4 flex justify-center">
          <div className="bg-blue-50 dark:bg-[#0f2733] border border-blue-200 dark:border-[#1e4356] rounded-2xl p-4 max-w-md w-full shadow-sm">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">📧 Email</p>
            <p className="text-sm text-blue-900 dark:text-blue-100 mt-2 whitespace-pre-wrap bg-black/5 dark:bg-black/15 p-3 rounded-xl border border-blue-200 dark:border-blue-900/40">{activity.content}</p>
            <p className="text-[10px] text-blue-700 dark:text-blue-300 mt-2 text-right uppercase font-semibold tracking-wide">
              {formatTime(activity.created_at)}
            </p>
          </div>
        </div>
      )
      lastSenderType = 'system_other'
      lastSenderName = ''
      return
    }

    // WhatsApp and System messages (bubbles)
    if (dateKey !== lastDateKey) {
      elements.push(<DateDivider key={`date-${dateKey}-${i}`} label={getDateLabel(date)} />)
      lastDateKey = dateKey
      lastSenderType = ''
      lastSenderName = ''
    }

    // For group chats, track individual sender names to show headers on participant change
    const currentSenderName = activity.metadata?.sender_name || ''
    const isGroupMsg = activity.metadata?.is_group === true
    const senderChanged = senderType !== lastSenderType || (isGroupMsg && senderType === 'lead' && currentSenderName !== lastSenderName)
    const showHeader = senderChanged
    const needsGap = showHeader && lastSenderType !== '' && lastSenderType !== 'system_other'
    lastSenderType = senderType as string
    lastSenderName = currentSenderName

    const reactionsForThisMessage = activity.metadata?.message_id
      ? reactionMap.get(activity.metadata.message_id)
      : undefined

    elements.push(
      <div key={activity.id} id={`activity-${activity.id}`} className={needsGap ? 'mt-4' : 'mt-1'}>
        <MessageBubble
          activity={activity}
          senderType={senderType as SenderType}
          showHeader={showHeader}
          lead={lead}
          reactions={reactionsForThisMessage}
          onImageClick={setSelectedImage}
          onReply={onReply}
          onTogglePin={onTogglePin}
          isPinned={pinnedActivityIds?.has(activity.id)}
        />
      </div>
    )
  })

  elements.push(<div key="end" ref={endRef} className="h-2" />)

  return (
    <>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 z-10 relative flex flex-col">
        <div className="flex flex-col flex-1 justify-end">{elements}</div>
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-6 right-6 text-white bg-black/50 hover:bg-black/80 transition flex items-center justify-center w-10 h-10 rounded-full shadow-lg border border-white/10"
            onClick={() => setSelectedImage(null)}
            title="Fechar (Esc)"
          >
            <X size={20} weight="bold" />
          </button>
          <img
            src={selectedImage}
            alt="Mídia Expandida"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-md shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
