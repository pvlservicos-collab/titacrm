'use client'

/**
 * Painel de detalhe de uma linha da planilha.
 *
 * A Agenda manda ~30 respostas de quiz e a agenda montada bloco a bloco — isso
 * não cabe em coluna (uma planilha de 40 colunas não se lê). Então a tabela
 * mostra o essencial e o resto vive aqui: quiz com rótulo legível e os blocos
 * agrupados por dia da semana.
 */

import { X, ArrowSquareOut } from '@phosphor-icons/react'
import Link from 'next/link'
import {
  AGENDA_BLOCK_CATEGORIES,
  AGENDA_QUIZ_LABELS,
  AGENDA_WEEKDAYS,
} from '@/lib/leadSources'
import type { Submission } from './types'

/** Minutos desde 00:00 → "08:30". */
function minutesToClock(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** Os valores do quiz vêm em tipos variados (número, bool, lista de dias). */
function formatQuizValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  // Listas de dias vêm como índices 0=seg … 6=dom.
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    if (/days$/i.test(key)) {
      return value.map((d) => AGENDA_WEEKDAYS[Number(d)] ?? d).join(', ')
    }
    return value.join(', ')
  }
  return String(value)
}

interface AgendaBlock {
  id?: number
  t?: string
  s?: number
  d?: number
  c?: string
  day?: number
}

export default function SubmissionDetail({
  submission,
  sourceKey,
  onClose,
}: {
  submission: Submission
  sourceKey: string
  onClose: () => void
}) {
  const payload = submission.payload || {}
  const quiz = (payload.a1 ?? null) as Record<string, unknown> | null
  const blocks = (Array.isArray(payload.real) ? payload.real : []) as AgendaBlock[]
  const isAgenda = sourceKey === 'agenda_ascensao'

  // Blocos agrupados por dia, cada dia em ordem cronológica.
  const blocksByDay = AGENDA_WEEKDAYS.map((label, day) => ({
    label,
    day,
    items: blocks
      .filter((b) => Number(b.day) === day)
      .sort((a, b) => (a.s ?? 0) - (b.s ?? 0)),
  })).filter((d) => d.items.length > 0)

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="glass-raised relative z-10 h-full w-full max-w-xl rounded-none border-y-0 border-r-0 flex flex-col animate-in slide-in-from-right duration-200">
        <div className="relative flex items-start justify-between gap-3 px-5 py-4 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink truncate">{submission.name || 'Sem nome'}</h2>
            <p className="text-xs text-muted mt-0.5">
              {submission.external_id ? `ID ${submission.external_id} · ` : ''}
              Recebido em {new Date(submission.received_at).toLocaleString('pt-BR')}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon w-9 h-9 flex-shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
          <div className="absolute bottom-0 left-0 right-0 h-px hairline-x" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 scrollbar-hide">
          {/* Contato */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2.5">Contato</h3>
            <dl className="panel rounded-xl divide-y divide-white/5">
              <Row label="WhatsApp" value={submission.phone} />
              <Row label="E-mail" value={submission.email} />
              <Row label="Instagram" value={submission.instagram} />
            </dl>
            {submission.lead_id && (
              <Link
                href={`/chat?leadId=${submission.lead_id}`}
                className="btn btn-outline btn-sm mt-3"
              >
                Abrir lead no CRM
                <ArrowSquareOut size={14} weight="bold" />
              </Link>
            )}
          </section>

          {/* Perfil profissional — só a Agenda tem esses campos */}
          {isAgenda && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2.5">Perfil</h3>
              <dl className="panel rounded-xl divide-y divide-white/5">
                <Row label="Área de atuação" value={payload.area as string} />
                <Row label="Aumento esperado em 6 meses" value={payload.aumento as string} />
                <Row label="Já investiu em cursos/mentorias" value={payload.investimento as string} />
                <Row
                  label="Quiz"
                  value={
                    payload.phase === 'done'
                      ? 'Completo, com agenda montada'
                      : payload.phase === 'w1'
                        ? 'Incompleto (parou no meio)'
                        : (payload.phase as string)
                  }
                />
              </dl>
            </section>
          )}

          {/* Respostas do quiz */}
          {quiz && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2.5">
                Respostas do quiz
              </h3>
              <dl className="panel rounded-xl divide-y divide-white/5">
                {AGENDA_QUIZ_LABELS.map(({ key, label, hint }) => (
                  <Row
                    key={key}
                    label={label}
                    hint={hint}
                    value={formatQuizValue(key, quiz[key])}
                  />
                ))}
              </dl>
            </section>
          )}

          {/* Agenda montada */}
          {blocksByDay.length > 0 && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2.5">
                Agenda montada
                <span className="ml-1.5 font-medium normal-case tracking-normal text-muted/70">
                  {blocks.length} blocos
                </span>
              </h3>
              <div className="space-y-3">
                {blocksByDay.map((day) => (
                  <div key={day.day} className="panel rounded-xl p-3">
                    <p className="text-xs font-bold text-ink mb-2">{day.label}</p>
                    <div className="space-y-1.5">
                      {day.items.map((block, i) => {
                        const category = AGENDA_BLOCK_CATEGORIES[block.c ?? '']
                        const start = block.s ?? 0
                        const duration = block.d ?? 0
                        return (
                          <div key={block.id ?? i} className="flex items-center gap-2.5 text-xs">
                            <span
                              className="w-1.5 h-6 rounded-full flex-shrink-0"
                              style={{ backgroundColor: category?.color ?? 'var(--muted)' }}
                              title={category?.label ?? block.c}
                            />
                            <span className="text-muted tabular-nums flex-shrink-0 w-[86px]">
                              {minutesToClock(start)}–{minutesToClock(start + duration)}
                            </span>
                            <span className="text-ink truncate flex-1 min-w-0">{block.t || '—'}</span>
                            <span className="text-muted tabular-nums flex-shrink-0">
                              {formatDuration(duration)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                {Object.entries(AGENDA_BLOCK_CATEGORIES).map(([key, meta]) => (
                  <span key={key} className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: meta.color }}
                    />
                    {meta.label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Escape hatch: se a fonte mandar um campo que a tela ainda não sabe
              exibir, ele continua visível aqui em vez de sumir. */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2.5">
              Payload recebido
            </h3>
            <pre className="glass-sunken rounded-xl p-3 text-[11px] text-muted overflow-x-auto leading-relaxed">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </section>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value?: string | null; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
      <dt className="text-xs text-muted flex-shrink-0">
        {label}
        {hint && <span className="block text-[10px] text-muted/60">{hint}</span>}
      </dt>
      <dd className="text-xs text-ink text-right break-words min-w-0">{value || '—'}</dd>
    </div>
  )
}
