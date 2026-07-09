'use client'

import { useRef, useState } from 'react'
import { X, Image as ImageIcon, VideoCamera, FileAudio, FileText, Trash } from '@phosphor-icons/react'
import { QuickReply, QuickReplyInput } from '@/hooks/useQuickReplies'
import { QUICK_REPLY_VARIABLES, interpolateQuickReply } from '@/lib/quickReplyVariables'
import { uploadClientFile } from '@/lib/blobClient'

interface QuickReplyModalProps {
  scope: 'shared' | 'personal'
  quickReply?: QuickReply | null
  existingCategories: string[]
  onSave: (input: QuickReplyInput) => Promise<void>
  onClose: () => void
}

const SAMPLE_LEAD = { name: 'Maria Souza', phone: '5511999998888', agentName: 'Você' }

function mediaTypeFromFile(file: File): string {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'document'
}

function MediaIcon({ mediaType }: { mediaType: string | null }) {
  const props = { size: 18, className: 'text-gray-400 flex-shrink-0' }
  if (mediaType === 'image') return <ImageIcon {...props} />
  if (mediaType === 'video') return <VideoCamera {...props} />
  if (mediaType === 'audio') return <FileAudio {...props} />
  return <FileText {...props} />
}

export default function QuickReplyModal({ scope, quickReply, existingCategories, onSave, onClose }: QuickReplyModalProps) {
  const [shortcut, setShortcut] = useState(quickReply?.shortcut || '')
  const [category, setCategory] = useState(quickReply?.category || '')
  const [content, setContent] = useState(quickReply?.content || '')
  const [mediaUrl, setMediaUrl] = useState<string | null>(quickReply?.mediaUrl || null)
  const [mediaType, setMediaType] = useState<string | null>(quickReply?.mediaType || null)
  const [mediaFilename, setMediaFilename] = useState<string | null>(quickReply?.mediaFilename || null)
  const [mediaMimetype, setMediaMimetype] = useState<string | null>(quickReply?.mediaMimetype || null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!quickReply

  const insertVariable = (token: string) => {
    const el = contentRef.current
    if (!el) {
      setContent((c) => c + token)
      return
    }
    const start = el.selectionStart ?? content.length
    const end = el.selectionEnd ?? content.length
    const next = content.slice(0, start) + token + content.slice(end)
    setContent(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 16 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo: 16MB (limite de mídia do WhatsApp).')
      return
    }
    try {
      setUploading(true)
      setError(null)
      const url = await uploadClientFile(file, 'chat-media', 'quick-reply')
      setMediaUrl(url)
      setMediaType(mediaTypeFromFile(file))
      setMediaFilename(file.name)
      setMediaMimetype(file.type)
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar arquivo.')
    } finally {
      setUploading(false)
    }
  }

  const removeMedia = () => {
    setMediaUrl(null)
    setMediaType(null)
    setMediaFilename(null)
    setMediaMimetype(null)
  }

  const handleSubmit = async () => {
    setError(null)
    const cleanShortcut = shortcut.trim().replace(/^\/+/, '')
    if (!cleanShortcut) {
      setError('Informe um atalho.')
      return
    }
    if (/\s/.test(cleanShortcut)) {
      setError('O atalho não pode conter espaços.')
      return
    }
    if (!content.trim() && !mediaUrl) {
      setError('Informe um texto ou anexe uma mídia.')
      return
    }
    try {
      setSaving(true)
      await onSave({
        scope,
        shortcut: cleanShortcut,
        category: category.trim() || null,
        content,
        mediaUrl,
        mediaType,
        mediaMimetype,
        mediaFilename,
      })
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const preview = interpolateQuickReply(content, {
    name: SAMPLE_LEAD.name,
    phone: SAMPLE_LEAD.phone,
    agentName: SAMPLE_LEAD.agentName,
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">
            {isEditing ? 'Editar resposta rápida' : scope === 'shared' ? 'Nova resposta compartilhada' : 'Novo atalho pessoal'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Atalho</label>
            <div className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
              <span className="text-gray-400 font-mono text-sm">/</span>
              <input
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="promo-fim-de-ano"
                className="flex-1 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Categoria (opcional)</label>
            <input
              list="quick-reply-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Vendas, Pós-venda, Cobrança..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <datalist id="quick-reply-categories">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Mensagem</label>
              <div className="flex gap-1">
                {QUICK_REPLY_VARIABLES.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertVariable(v.token)}
                    title={v.label}
                    className="px-2 py-0.5 text-[11px] font-mono bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
                  >
                    {v.token}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Digite a mensagem..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
            {content.trim() && (
              <p className="mt-1.5 text-xs text-gray-500 italic truncate">Prévia: &quot;{preview}&quot;</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Mídia (opcional)</label>
            {mediaUrl ? (
              <div className="flex items-center gap-3 px-3 py-2 border border-gray-200 rounded-lg">
                <MediaIcon mediaType={mediaType} />
                <span className="flex-1 text-sm text-gray-700 truncate">{mediaFilename || 'Arquivo anexado'}</span>
                <button type="button" onClick={removeMedia} className="text-gray-400 hover:text-red-500">
                  <Trash size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                {uploading ? 'Enviando...' : 'Anexar foto, vídeo, áudio ou documento'}
              </button>
            )}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || uploading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
