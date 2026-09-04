'use client'

import { memo } from 'react'

export type ChatTab = 'all' | 'human' | 'urgent'

interface ChatFilterTabsProps {
  activeTab: ChatTab
  onChange: (tab: ChatTab) => void
  counts: Record<ChatTab, number>
}

const TABS: { key: ChatTab; label: string }[] = [
  { key: 'all', label: 'TODOS' },
  { key: 'human', label: 'HUMANO' },
  { key: 'urgent', label: 'URGENTES' },
]

function ChatFilterTabs({ activeTab, onChange, counts }: ChatFilterTabsProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--chat-border)] overflow-x-auto">
      {TABS.map(({ key, label }) => {
        const isActive = activeTab === key
        const count = counts[key]
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-[var(--chat-accent)] text-[var(--chat-bg-conversation)]'
                : 'bg-[var(--chat-bg-panel)] text-[var(--chat-text-muted)] hover:bg-[var(--chat-bg-menu)] hover:text-[var(--chat-text-primary)]'
            }`}
          >
            {label}
            {count > 0 && (
              <span
                className={`px-1.5 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-[var(--chat-bg-conversation)]/20 text-[var(--chat-bg-conversation)]' : 'bg-[var(--chat-border)] text-[var(--chat-text-primary)]'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default memo(ChatFilterTabs)
