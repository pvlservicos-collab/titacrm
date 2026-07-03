'use client'

import { useMemo, useRef, useEffect } from 'react'
import { Image, VideoCamera, FileAudio, FileText, Lightning } from '@phosphor-icons/react'
import { QuickReply } from '@/hooks/useQuickReplies'

export interface QuickReplyGroup {
  label: string
  items: QuickReply[]
}

/** Filtra + agrupa (biblioteca da empresa por categoria, depois "Meus Atalhos") — usado
 * tanto pelo picker (renderização) quanto pelo composer (navegação por teclado), para que
 * os dois nunca fiquem com uma ordem diferente da lista. */
export function filterAndGroupQuickReplies(shared: QuickReply[], personal: QuickReply[], filter: string) {
  const needle = filter.trim().toLowerCase()
  const matches = (qr: QuickReply) =>
    !needle || qr.shortcut.toLowerCase().includes(needle) || qr.content.toLowerCase().includes(needle)

  const sharedFiltered = shared.filter(matches)
  const personalFiltered = personal.filter(matches)

  const byCategory = new Map<string, QuickReply[]>()
  for (const qr of sharedFiltered) {
    const key = qr.category?.trim() || 'Outros'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key)!.push(qr)
  }

  const groups: QuickReplyGroup[] = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, items }))

  if (personalFiltered.length > 0) {
    groups.push({ label: 'Meus Atalhos', items: personalFiltered })
  }

  const flat = groups.flatMap((g) => g.items)
  return { groups, flat }
}

function MediaGlyph({ mediaType }: { mediaType: string | null }) {
  if (!mediaType) return null
  const props = { size: 13, className: 'text-[#8696a0] flex-shrink-0' }
  if (mediaType === 'image' || mediaType === 'sticker') return <Image {...props} />
  if (mediaType === 'video') return <VideoCamera {...props} />
  if (mediaType === 'audio') return <FileAudio {...props} />
  return <FileText {...props} />
}

interface QuickReplyPickerProps {
  shared: QuickReply[]
  personal: QuickReply[]
  filter: string
  highlightedIndex: number
  onHighlightIndex: (index: number) => void
  onSelect: (item: QuickReply) => void
}

export default function QuickReplyPicker({
  shared,
  personal,
  filter,
  highlightedIndex,
  onHighlightIndex,
  onSelect,
}: QuickReplyPickerProps) {
  const { groups, flat } = useMemo(
    () => filterAndGroupQuickReplies(shared, personal, filter),
    [shared, personal, filter]
  )
  const highlightedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  let runningIndex = -1

  return (
    <div className="w-[340px] max-h-[320px] overflow-y-auto bg-[#233138] border border-[#2f3b44] rounded-xl shadow-lg py-2">
      {flat.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[#8696a0]">
          {shared.length === 0 && personal.length === 0 ? (
            <>Nenhuma resposta rápida cadastrada ainda.<br />Configure em Ajustes → Respostas Rápidas.</>
          ) : (
            'Nenhum atalho encontrado.'
          )}
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="mb-1 last:mb-0">
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#667781]">
              {group.label}
            </p>
            {group.items.map((qr) => {
              runningIndex += 1
              const index = runningIndex
              const isHighlighted = index === highlightedIndex
              return (
                <button
                  key={qr.id}
                  ref={isHighlighted ? highlightedRef : undefined}
                  type="button"
                  onMouseEnter={() => onHighlightIndex(index)}
                  onClick={() => onSelect(qr)}
                  className={`w-full flex items-start gap-2 px-3 py-2 text-left transition-colors ${
                    isHighlighted ? 'bg-[#2a3942]' : 'hover:bg-[#2a3942]/60'
                  }`}
                >
                  <Lightning size={13} weight="fill" className="text-[#00B8D9] flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-[#e9edef]">/{qr.shortcut}</span>
                      <MediaGlyph mediaType={qr.mediaType} />
                    </div>
                    {qr.content && (
                      <p className="text-[11px] text-[#8696a0] truncate">{qr.content}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
