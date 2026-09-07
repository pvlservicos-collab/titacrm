'use client'

/**
 * /settings/leads — log dos leads recebidos, uma aba por fonte.
 *
 * Cada aba é uma planilha cujas colunas vêm da definição da fonte no servidor
 * (GET /api/lead-sources → src/lib/leadSources.ts), não daqui. Clicar numa linha
 * abre o detalhe com o payload inteiro.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, ArrowClockwise, Table, PlugsConnected } from '@phosphor-icons/react'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'
import SubmissionsTable from '@/components/Leads/SubmissionsTable'
import SubmissionDetail from '@/components/Leads/SubmissionDetail'
import ApiPanel from '@/components/Leads/ApiPanel'
import type { LeadSourceTab, Submission } from '@/components/Leads/types'

const PAGE_SIZE = 100

export default function LeadsPage() {
  const [sources, setSources] = useState<LeadSourceTab[]>([])
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const [rows, setRows] = useState<Submission[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loadingSources, setLoadingSources] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [selected, setSelected] = useState<Submission | null>(null)
  const [showApiPanel, setShowApiPanel] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/lead-sources')
        const json = await res.json()
        if (cancelled) return
        const data: LeadSourceTab[] = json.data || []
        setSources(data)
        setActiveSource((current) => current ?? data[0]?.key ?? null)
      } catch {
        if (!cancelled) setError('Não foi possível carregar as fontes de lead.')
      } finally {
        if (!cancelled) setLoadingSources(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const loadRows = useCallback(async (source: string, q: string) => {
    setLoadingRows(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (q) params.set('q', q)
      const res = await fetch(`/api/lead-sources/${source}/submissions?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar os leads.')
      setRows(json.data || [])
      setTotal(json.total ?? 0)
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar os leads.')
      setRows([])
      setTotal(0)
    } finally {
      setLoadingRows(false)
    }
  }, [])

  // Busca com atraso: digitar não dispara uma requisição por tecla.
  useEffect(() => {
    if (!activeSource) return
    const timer = setTimeout(() => { loadRows(activeSource, search.trim()) }, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [activeSource, search, loadRows])

  const activeDef = useMemo(
    () => sources.find((s) => s.key === activeSource) ?? null,
    [sources, activeSource]
  )

  if (loadingSources) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner text="Carregando…" size="lg" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">Leads</h1>
            <p className="text-sm text-muted mt-1">
              Tudo que chegou de cada fonte, do mais recente para o mais antigo.
            </p>
          </div>
          <button
            onClick={() => setShowApiPanel((v) => !v)}
            className={`btn btn-sm ${showApiPanel ? 'btn-secondary' : 'btn-outline'}`}
          >
            <PlugsConnected size={15} weight="bold" />
            {showApiPanel ? 'Ocultar integração' : 'Como enviar leads'}
          </button>
        </div>

        {showApiPanel && activeSource && (
          <ApiPanel sources={sources} activeSource={activeSource} />
        )}

        {/* Abas — uma por fonte */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {sources.map((source) => (
            <button
              key={source.key}
              onClick={() => { setActiveSource(source.key); setSearch('') }}
              className={`pill flex-shrink-0 !px-4 !py-2 !text-sm ${
                source.key === activeSource ? 'pill-active' : ''
              }`}
            >
              <Table size={15} weight="bold" />
              {source.label}
              <span
                className={`ml-0.5 px-1.5 rounded-full text-[10px] font-bold ${
                  source.key === activeSource ? 'bg-black/30 text-ink' : 'bg-white/10 text-muted'
                }`}
              >
                {source.total}
              </span>
            </button>
          ))}
        </div>

        {activeDef && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">{activeDef.description}</p>
              {activeDef.last_received_at && (
                <p className="text-[11px] text-muted/70 mt-0.5">
                  Último recebido em {new Date(activeDef.last_received_at).toLocaleString('pt-BR')}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative">
                <MagnifyingGlass
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nome, telefone, e-mail…"
                  className="field !pl-9 !py-2 !text-xs w-[260px]"
                />
              </div>
              <button
                onClick={() => activeSource && loadRows(activeSource, search.trim())}
                className="btn-icon w-9 h-9"
                title="Atualizar"
              >
                <ArrowClockwise size={16} weight="bold" />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="glass rounded-xl border-red-500/30 px-4 py-3">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {loadingRows ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner text="Carregando leads…" />
          </div>
        ) : rows.length === 0 ? (
          <div className="glass rounded-2xl px-6 py-16 text-center">
            <p className="text-sm font-semibold text-ink">
              {search ? 'Nenhum lead encontrado para essa busca.' : 'Nenhum lead recebido ainda.'}
            </p>
            {!search && (
              <p className="text-xs text-muted mt-1.5">
                Assim que a fonte começar a enviar, os leads aparecem aqui.{' '}
                <button
                  onClick={() => setShowApiPanel(true)}
                  className="text-accent-2 hover:underline"
                >
                  Ver como enviar
                </button>
              </p>
            )}
          </div>
        ) : (
          <>
            {activeDef && (
              <SubmissionsTable
                columns={activeDef.columns}
                rows={rows}
                onSelect={setSelected}
              />
            )}
            <p className="text-[11px] text-muted text-center">
              Mostrando {rows.length} de {total}
              {total > rows.length && ' — use a busca para encontrar leads mais antigos'}
            </p>
          </>
        )}
      </div>

      {selected && activeSource && (
        <SubmissionDetail
          submission={selected}
          sourceKey={activeSource}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
