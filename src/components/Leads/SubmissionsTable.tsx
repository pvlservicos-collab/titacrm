'use client'

/**
 * A planilha de uma aba.
 *
 * As colunas não são fixas no componente: vêm da definição da fonte
 * (src/lib/leadSources.ts, servidas por GET /api/lead-sources). Fonte nova com
 * outras colunas não pede mudança aqui.
 *
 * Resolução de célula: as colunas fixas (name, phone, email, instagram,
 * external_id, received_at) saem direto da linha; qualquer outra chave é
 * procurada no `payload`, que é onde ficam os campos específicos da fonte.
 */

import { memo } from 'react'
import { formatPhone } from '@/lib/utils'
import type { LeadSourceColumn } from '@/lib/leadSources'
import type { Submission } from './types'

const FIXED_KEYS = new Set(['name', 'email', 'phone', 'instagram', 'external_id', 'received_at', 'updated_at'])

/**
 * A linha inteira abre o painel de detalhe, então todo link dentro dela precisa
 * parar a propagação — senão clicar no Instagram abre o perfil numa aba nova E
 * o painel aqui atrás, ao mesmo tempo.
 */
const pararPropagacao = (e: React.MouseEvent) => e.stopPropagation()

/** URL do perfil a partir do que está guardado (`@handle`). */
export function instagramUrl(value: string): string {
  const handle = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '')
  return `https://instagram.com/${handle}`
}

function resolveValue(row: Submission, key: string): unknown {
  if (FIXED_KEYS.has(key)) return (row as any)[key]
  return row.payload?.[key]
}

function formatCell(value: unknown, column: LeadSourceColumn): string {
  if (value === null || value === undefined || value === '') return '—'

  switch (column.format) {
    case 'phone':
      return formatPhone(String(value))
    case 'datetime': {
      const date = new Date(String(value))
      return Number.isNaN(date.getTime())
        ? String(value)
        : date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
    }
    case 'number':
      return String(value)
    default:
      return String(value)
  }
}

/** Rótulo curto pra `agenda.phase`, que chega como "done"/"w1". */
const PHASE_LABELS: Record<string, { label: string; tone: 'ok' | 'partial' }> = {
  done: { label: 'Completo', tone: 'ok' },
  w1: { label: 'Incompleto', tone: 'partial' },
}

function Cell({ row, column }: { row: Submission; column: LeadSourceColumn }) {
  const value = resolveValue(row, column.key)

  if (column.format === 'badge') {
    if (value === null || value === undefined || value === '') {
      return <span className="text-muted">—</span>
    }
    const phase = PHASE_LABELS[String(value)]
    if (phase) {
      return (
        <span
          className={`pill !py-0.5 !text-[11px] ${
            phase.tone === 'ok'
              ? '!border-emerald-500/30 !bg-emerald-500/10 !text-emerald-300'
              : '!border-amber-500/30 !bg-amber-500/10 !text-amber-300'
          }`}
        >
          {phase.label}
        </span>
      )
    }
    return <span className="pill !py-0.5 !text-[11px]">{String(value)}</span>
  }

  if (column.format === 'email' && value) {
    return (
      <a
        href={`mailto:${value}`}
        onClick={pararPropagacao}
        className="text-ink hover:text-accent-2 underline decoration-dotted underline-offset-2 transition-colors"
      >
        {String(value)}
      </a>
    )
  }

  if (column.format === 'instagram' && value) {
    return (
      <a
        href={instagramUrl(String(value))}
        target="_blank"
        rel="noopener noreferrer"
        onClick={pararPropagacao}
        className="text-ink hover:text-accent-2 underline decoration-dotted underline-offset-2 transition-colors"
      >
        {String(value)}
      </a>
    )
  }

  const text = formatCell(value, column)
  return (
    <span className={value === null || value === undefined || value === '' ? 'text-muted' : 'text-ink'}>
      {text}
    </span>
  )
}

interface SubmissionsTableProps {
  columns: LeadSourceColumn[]
  rows: Submission[]
  onSelect: (row: Submission) => void
}

function SubmissionsTable({ columns, rows, onSelect }: SubmissionsTableProps) {
  return (
    // overflow-x no wrapper (não no body da página): planilha larga rola dentro
    // do próprio card, a página nunca escorrega na horizontal.
    <div className="glass-sunken rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{ minWidth: column.width ?? 140 }}
                  className="sticky top-0 z-10 text-left font-semibold text-muted uppercase tracking-wider text-[10px] px-3.5 py-2.5 whitespace-nowrap surface-raised"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect(row)}
                className="cursor-pointer border-t border-white/[0.06] hover:bg-white/[0.04] transition-colors"
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-3.5 py-2.5 align-top whitespace-nowrap">
                    <Cell row={row} column={column} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default memo(SubmissionsTable)
