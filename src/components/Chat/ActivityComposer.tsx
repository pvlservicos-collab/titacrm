'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { EmojiClickData, Theme } from 'emoji-picker-react'
import {
  PaperPlaneRight,
  Smiley,
  Paperclip,
  Microphone,
  Lightning,
  Pause,
  Sparkle,
  X,
  ArrowBendUpLeft,
  Flag,
  ChatText
} from '@phosphor-icons/react'
import { ReplyContext } from './ChatWindow'
import { ChatButtonSettings, ChatButtonKey } from '@/hooks/useChatButtonSettings'
import { useAuth, useQuickReplies, useAudioRecorder } from '@/hooks'
import { QuickReply } from '@/hooks/useQuickReplies'
import { interpolateQuickReply } from '@/lib/quickReplyVariables'
import QuickReplyPicker, { filterAndGroupQuickReplies } from './QuickReplyPicker'

// Carregado sob demanda: o pacote traz o dataset inteiro de emojis, só vale a pena
// baixar quando o usuário realmente abre o seletor, não em toda visita ao chat.
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false })

interface QuickReplyMediaPayload {
  content: string
  mediaUrl: string
  mediaType: string
  mediaFilename?: string | null
  mediaMimetype?: string | null
}

interface ActivityComposerProps {
  onSend: (content: string) => Promise<void>
  onSendMedia?: (file: File) => Promise<void>
  onSendQuickReplyMedia?: (payload: QuickReplyMediaPayload) => Promise<void>
  replyContext?: ReplyContext | null
  onCancelReply?: () => void
  chatButtonSettings?: ChatButtonSettings
  fireWebhook?: (key: ChatButtonKey) => Promise<boolean>
  organizationId?: string | null
  lead?: { title?: string | null; phone?: string | null }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function ActivityComposer({
  onSend,
  onSendMedia,
  onSendQuickReplyMedia,
  replyContext,
  onCancelReply,
  chatButtonSettings,
  fireWebhook,
  organizationId,
  lead,
}: ActivityComposerProps) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [webhookStatus, setWebhookStatus] = useState<{
    key: ChatButtonKey
    status: 'sending' | 'success' | 'error'
  } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)

  // ── Respostas rápidas ────────────────────────────────────────────────────
  const { profileName: agentName } = useAuth()
  const { shared: sharedQuickReplies, personal: personalQuickReplies } = useQuickReplies(organizationId)
  const [showQuickReplyPicker, setShowQuickReplyPicker] = useState(false)
  const [manualSearchQuery, setManualSearchQuery] = useState('')
  const [quickReplyHighlight, setQuickReplyHighlight] = useState(0)
  const [sendingQuickReplyMedia, setSendingQuickReplyMedia] = useState(false)
  const quickReplyButtonRef = useRef<HTMLButtonElement>(null)
  const quickReplyPickerRef = useRef<HTMLDivElement>(null)

  // A biblioteca só abre "no modo /" quando o campo inteiro é "/" + palavra — assim uma
  // mensagem que só por acaso começa com "/" não é sequestrada pelo menu.
  const slashMatch = content.match(/^\/([\w-]*)$/)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const quickReplyPickerOpen = (!!slashMatch && !slashDismissed) || showQuickReplyPicker
  const quickReplyFilter = slashMatch ? slashMatch[1] : manualSearchQuery

  useEffect(() => {
    if (content === '/') setSlashDismissed(false)
  }, [content])

  const closeQuickReplyPicker = useCallback(() => {
    setSlashDismissed(true)
    setShowQuickReplyPicker(false)
  }, [])

  useEffect(() => {
    setQuickReplyHighlight(0)
  }, [quickReplyFilter, quickReplyPickerOpen])

  useEffect(() => {
    if (quickReplyPickerOpen) setShowEmojiPicker(false)
  }, [quickReplyPickerOpen])

  const { flat: quickReplyFlatList } = useMemo(
    () => filterAndGroupQuickReplies(sharedQuickReplies, personalQuickReplies, quickReplyFilter),
    [sharedQuickReplies, personalQuickReplies, quickReplyFilter]
  )

  // ── Gravação de áudio ────────────────────────────────────────────────────
  const recorder = useAudioRecorder()
  const [recordingError, setRecordingError] = useState<string | null>(null)

  // Focus input when reply context changes
  useEffect(() => {
    if (replyContext) {
      inputRef.current?.focus()
    }
  }, [replyContext])

  // Close emoji/quick-reply pickers on outside click (mas nunca ao clicar dentro do textarea,
  // senão digitar "/algo" fecharia o próprio menu que acabou de abrir)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        showEmojiPicker &&
        emojiPickerRef.current && !emojiPickerRef.current.contains(target) &&
        emojiButtonRef.current && !emojiButtonRef.current.contains(target)
      ) {
        setShowEmojiPicker(false)
      }
      if (
        quickReplyPickerOpen &&
        quickReplyPickerRef.current && !quickReplyPickerRef.current.contains(target) &&
        quickReplyButtonRef.current && !quickReplyButtonRef.current.contains(target) &&
        inputRef.current && !inputRef.current.contains(target)
      ) {
        closeQuickReplyPicker()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker, quickReplyPickerOpen, closeQuickReplyPicker])

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    setContent((prev) => prev + emojiData.emoji)
    inputRef.current?.focus()
  }, [])

  // Auto-resize textarea to fit content, capped at max height
  const autoResize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto' // reset to recalculate
    el.style.height = `${Math.min(el.scrollHeight, 160)}px` // max ~6 lines
  }, [])

  useEffect(() => {
    autoResize()
  }, [content, autoResize])

  const handleSend = async () => {
    if (!content.trim()) return

    const msgToSend = content
    setContent('') // Clear instantly for optimal user perception
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    try {
      setSending(true)
      await onSend(msgToSend)
    } catch (error) {
      console.error('Failed to send:', error)
      setContent(msgToSend) // Revert on error
    } finally {
      setSending(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onSendMedia) return

    try {
      setUploadingMedia(true)
      await onSendMedia(file)
    } finally {
      setUploadingMedia(false)
    }
  }

  const handleMicClick = async () => {
    if (recorder.isRecording) {
      const blob = await recorder.stop()
      if (!onSendMedia) return
      const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type || 'audio/webm' })
      try {
        setUploadingMedia(true)
        await onSendMedia(file)
      } finally {
        setUploadingMedia(false)
      }
      return
    }

    try {
      setRecordingError(null)
      await recorder.start()
    } catch (err) {
      console.error('Failed to start recording:', err)
      setRecordingError('Não foi possível acessar o microfone.')
    }
  }

  const handleSelectQuickReply = async (qr: QuickReply) => {
    if (sendingQuickReplyMedia) return
    const wasSlash = !!slashMatch
    closeQuickReplyPicker()

    const interpolated = interpolateQuickReply(qr.content, {
      name: lead?.title,
      phone: lead?.phone,
      agentName,
    })

    if (qr.mediaUrl && qr.mediaType) {
      if (wasSlash) setContent('')
      if (!onSendQuickReplyMedia) return
      try {
        setSendingQuickReplyMedia(true)
        await onSendQuickReplyMedia({
          content: interpolated,
          mediaUrl: qr.mediaUrl,
          mediaType: qr.mediaType,
          mediaFilename: qr.mediaFilename,
          mediaMimetype: qr.mediaMimetype,
        })
      } finally {
        setSendingQuickReplyMedia(false)
      }
      return
    }

    setContent(interpolated)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleChatButtonClick = async (key: ChatButtonKey) => {
    if (!fireWebhook) return
    setWebhookStatus({ key, status: 'sending' })
    const ok = await fireWebhook(key)
    setWebhookStatus({ key, status: ok ? 'success' : 'error' })
    setTimeout(() => setWebhookStatus(null), 2500)
  }

  const getButtonStateClass = (key: ChatButtonKey, baseClasses: string) => {
    const isThisButton = webhookStatus?.key === key
    const status = isThisButton ? webhookStatus?.status : null
    if (status === 'success') return 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300'
    if (status === 'error') return 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
    if (status === 'sending') return 'bg-[var(--chat-bg-field)] border-[var(--chat-border)] text-[var(--chat-text-tertiary)] cursor-wait'
    return baseClasses
  }

  const getButtonStatusIcon = (key: ChatButtonKey) => {
    const isThisButton = webhookStatus?.key === key
    const status = isThisButton ? webhookStatus?.status : null
    if (status === 'sending') return <span className="animate-spin text-[10px] ml-1">⏳</span>
    if (status === 'success') return <span className="text-[10px] ml-1">✓</span>
    if (status === 'error') return <span className="text-[10px] ml-1">✗</span>
    return null
  }

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (quickReplyPickerOpen && quickReplyFlatList.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setQuickReplyHighlight((i) => Math.min(i + 1, quickReplyFlatList.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setQuickReplyHighlight((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        handleSelectQuickReply(quickReplyFlatList[quickReplyHighlight])
        return
      }
    }
    if (e.key === 'Escape' && quickReplyPickerOpen) {
      e.preventDefault()
      closeQuickReplyPicker()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape' && replyContext) {
      onCancelReply?.()
    }
    if (e.key === 'Escape' && showEmojiPicker) {
      setShowEmojiPicker(false)
    }
  }

  return (
    <div className="px-6 pb-4 pt-2 space-y-3 relative z-10 bg-gradient-to-t from-[var(--chat-bg-conversation)] to-transparent">
      {/* Action Buttons */}
      <div className="flex gap-2 items-center mb-1 flex-wrap">
        {chatButtonSettings?.pausar_ia?.enabled && (!chatButtonSettings.pausar_ia.position || chatButtonSettings.pausar_ia.position === 'chat') && (
          <button
            onClick={() => handleChatButtonClick('pausar_ia')}
            disabled={webhookStatus?.key === 'pausar_ia' && webhookStatus.status === 'sending'}
            className={`flex items-center gap-1.5 px-4 py-1.5 border rounded-full text-[11px] font-bold transition-colors ${getButtonStateClass('pausar_ia', 'text-purple-700 dark:text-purple-300 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20')}`}
          >
            <Pause size={14} weight="bold" />
            Pausar IA
            {getButtonStatusIcon('pausar_ia')}
          </button>
        )}
        {chatButtonSettings?.sugerir_passos?.enabled && (!chatButtonSettings.sugerir_passos.position || chatButtonSettings.sugerir_passos.position === 'chat') && (
          <button
            onClick={() => handleChatButtonClick('sugerir_passos')}
            disabled={webhookStatus?.key === 'sugerir_passos' && webhookStatus.status === 'sending'}
            className={`flex items-center gap-1.5 px-4 py-1.5 border rounded-full text-[11px] font-bold transition-colors ${getButtonStateClass('sugerir_passos', 'border-[var(--chat-border)] text-[var(--chat-icon)] bg-[var(--chat-bg-field)] hover:bg-[var(--chat-bg-hover)]')}`}
          >
            <Sparkle size={14} weight="bold" />
            Sugerir próximos passos
            {getButtonStatusIcon('sugerir_passos')}
          </button>
        )}
        {chatButtonSettings?.sinalizar_ajuste?.enabled && (!chatButtonSettings.sinalizar_ajuste.position || chatButtonSettings.sinalizar_ajuste.position === 'chat') && (
          <button
            onClick={() => handleChatButtonClick('sinalizar_ajuste')}
            disabled={webhookStatus?.key === 'sinalizar_ajuste' && webhookStatus.status === 'sending'}
            className={`flex items-center gap-1.5 px-4 py-1.5 border rounded-full text-[11px] font-bold transition-colors ${getButtonStateClass('sinalizar_ajuste', 'border-orange-500/30 text-orange-700 dark:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20')}`}
          >
            <Flag size={14} weight="bold" />
            Sinalizar ajuste
            {getButtonStatusIcon('sinalizar_ajuste')}
          </button>
        )}
        {chatButtonSettings?.resumir_conversa?.enabled && (!chatButtonSettings.resumir_conversa.position || chatButtonSettings.resumir_conversa.position === 'chat') && (
          <button
            onClick={() => handleChatButtonClick('resumir_conversa')}
            disabled={webhookStatus?.key === 'resumir_conversa' && webhookStatus.status === 'sending'}
            className={`flex items-center gap-1.5 px-4 py-1.5 border rounded-full text-[11px] font-bold transition-colors ${getButtonStateClass('resumir_conversa', 'border-sky-500/30 text-sky-700 dark:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20')}`}
          >
            <ChatText size={14} weight="bold" />
            Resumir conversa
            {getButtonStatusIcon('resumir_conversa')}
          </button>
        )}
      </div>

      {/* Reply Preview Bar */}
      {replyContext && (
        <div className="flex items-center bg-[var(--chat-bg-field)] border border-[var(--chat-border)] rounded-xl px-3 py-2 shadow-sm animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-1 h-8 rounded-full bg-[var(--chat-accent)] flex-shrink-0" />
            <ArrowBendUpLeft size={14} weight="bold" className="text-[var(--chat-accent)] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[var(--chat-accent)] truncate">{replyContext.sender}</p>
              <p className="text-[12px] text-[var(--chat-text-muted)] truncate">{replyContext.text}</p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="ml-2 p-1 rounded-full hover:bg-[var(--chat-bg-hover)] text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] transition-colors flex-shrink-0"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      )}

      {recordingError && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-700 dark:text-red-300">
          {recordingError}
        </div>
      )}

      {/* Input Area */}
      <div className="relative flex items-end gap-2 bg-[var(--chat-bg-field)] border border-[var(--chat-border)] rounded-xl px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-[var(--chat-bg-hover)] focus-within:border-[var(--chat-accent)]/50 transition-all">
        {recorder.isRecording ? (
          <>
            <div className="flex items-center gap-3 flex-1 py-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-sm text-[var(--chat-text-primary)] tabular-nums">{formatDuration(recorder.durationMs)}</span>
              <span className="text-xs text-[var(--chat-text-muted)]">Gravando áudio...</span>
            </div>
            <button
              type="button"
              onClick={() => recorder.cancel()}
              className="p-1 text-[var(--chat-text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
              title="Cancelar gravação"
            >
              <X size={18} weight="bold" />
            </button>
            <button
              type="button"
              onClick={handleMicClick}
              disabled={uploadingMedia}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors hover:opacity-90 disabled:opacity-50 flex-shrink-0 mb-0.5"
              style={{ backgroundColor: '#00B8D9' }}
              title="Enviar áudio"
            >
              {uploadingMedia ? <span className="animate-spin text-sm inline-block">⏳</span> : <PaperPlaneRight size={16} weight="fill" />}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-0 pb-0.5">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingMedia || !onSendMedia}
                className="text-[var(--chat-text-muted)] hover:text-[var(--chat-icon)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Enviar mídia"
              >
                {uploadingMedia ? (
                  <span className="animate-spin text-sm inline-block">⏳</span>
                ) : (
                  <Paperclip size={20} />
                )}
              </button>
              <button
                type="button"
                onClick={handleMicClick}
                disabled={uploadingMedia || !onSendMedia}
                className="text-[var(--chat-text-muted)] hover:text-[var(--chat-icon)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Gravar áudio"
              >
                <Microphone size={20} />
              </button>
              <button
                ref={quickReplyButtonRef}
                type="button"
                onClick={() => {
                  setShowEmojiPicker(false)
                  setManualSearchQuery('')
                  setShowQuickReplyPicker((prev) => !prev)
                }}
                className={`transition-colors ${quickReplyPickerOpen ? 'text-[#00B8D9]' : 'text-[var(--chat-text-muted)] hover:text-[var(--chat-icon)]'}`}
                title="Respostas rápidas"
              >
                <Lightning size={20} />
              </button>
              <button
                ref={emojiButtonRef}
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className={`transition-colors ${showEmojiPicker
                  ? 'text-[var(--chat-accent)]'
                  : 'text-[var(--chat-text-muted)] hover:text-[var(--chat-icon)]'
                  }`}
              >
                <Smiley size={20} />
              </button>
            </div>

            {/* Emoji Picker Popover */}
            {showEmojiPicker && (
              <div
                ref={emojiPickerRef}
                className="absolute bottom-full left-0 mb-2 z-50"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
              >
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  theme={'dark' as Theme}
                  width={350}
                  height={400}
                  searchPlaceHolder="Buscar emoji..."
                  previewConfig={{ showPreview: false }}
                  lazyLoadEmojis
                />
              </div>
            )}

            {/* Quick Reply Picker Popover */}
            {quickReplyPickerOpen && (
              <div
                ref={quickReplyPickerRef}
                className="absolute bottom-full left-0 mb-2 z-50"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
              >
                {!slashMatch && (
                  <input
                    autoFocus
                    value={manualSearchQuery}
                    onChange={(e) => setManualSearchQuery(e.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Buscar resposta rápida..."
                    className="w-[340px] mb-1.5 px-3 py-2 text-sm rounded-lg bg-[var(--chat-bg-hover)] border border-[var(--chat-border)] text-[var(--chat-text-primary)] placeholder-[var(--chat-text-muted)] focus:outline-none focus:border-[var(--chat-accent)]/50"
                  />
                )}
                <QuickReplyPicker
                  shared={sharedQuickReplies}
                  personal={personalQuickReplies}
                  filter={quickReplyFilter}
                  highlightedIndex={quickReplyHighlight}
                  onHighlightIndex={setQuickReplyHighlight}
                  onSelect={handleSelectQuickReply}
                />
              </div>
            )}

            <textarea
              ref={inputRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={replyContext ? 'Digite sua resposta...' : "Digite sua mensagem ou digite '/' para respostas rápidas..."}
              className="flex-1 text-sm focus:outline-none text-[var(--chat-text-primary)] placeholder-[var(--chat-text-muted)] bg-transparent resize-none overflow-y-auto leading-[1.5] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              rows={1}
              style={{ maxHeight: '160px' }}
            />
            <button
              onClick={handleSend}
              disabled={!content.trim()}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 mb-0.5"
              style={{ backgroundColor: '#00B8D9' }}
            >
              <PaperPlaneRight size={16} weight="fill" />
            </button>
          </>
        )}
      </div>

      {/* Hint */}
      <p className="text-center text-[10px] font-bold uppercase tracking-wider text-[var(--chat-text-tertiary)]">
        Enter para enviar · Shift+Enter para nova linha{replyContext ? ' · Esc para cancelar reply' : ''}
      </p>
    </div>
  )
}
