'use client'

import { useMemo, useState } from 'react'

interface ChartOrder {
  created_at: string
  delivery_status: string
}

type StatusKey = 'emProcesso' | 'entregue' | 'cancelado'

interface DayBucket extends Record<StatusKey, number> {
  key: string
  date: Date
  total: number
}

// Mesmas cores de status usadas nos badges de pedido e nos cards de resumo acima
// (laranja = pendente/em processo, verde = sucesso, vermelho = cancelado) — o
// gráfico usa o mesmo "idioma" de cor do resto da tela, não inventa um novo.
const STATUS_ORDER: StatusKey[] = ['emProcesso', 'entregue', 'cancelado'] // empilhamento: base → topo
const STATUS_META: Record<StatusKey, { label: string; color: string }> = {
  emProcesso: { label: 'Em processo', color: '#fab219' },
  entregue: { label: 'Entregue', color: '#0ca30c' },
  cancelado: { label: 'Cancelado', color: '#d03b3b' },
}

const WINDOW_OPTIONS = [
  { days: 7, label: '7 dias' },
  { days: 14, label: '14 dias' },
  { days: 30, label: '30 dias' },
]

const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function statusKey(deliveryStatus: string): StatusKey {
  if (deliveryStatus === 'delivered') return 'entregue'
  if (deliveryStatus === 'cancelled') return 'cancelado'
  return 'emProcesso'
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatDay(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`
}

/** Degrau "redondo" pro eixo Y (0/5/10/25...) — mag nunca fica abaixo de 1: são
 * contagens de pedidos, sempre inteiras. */
function niceStep(max: number, targetTicks = 4) {
  if (max <= 0) return 1
  const rough = max / targetTicks
  const mag = Math.max(1, Math.pow(10, Math.floor(Math.log10(rough))))
  const norm = rough / mag
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10
  return Math.max(1, step * mag)
}

/** Retângulo com cantos arredondados só no topo (base quadrada, encostada no eixo)
 * — é o "data-end" da barra empilhada; todo o resto do stack fica quadrado. */
function roundedTopRectPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, h, w / 2))
  if (rr === 0) return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`
}

export default function OrderStatusChart({ orders }: { orders: ChartOrder[] }) {
  const [windowDays, setWindowDays] = useState(14)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const days = useMemo<DayBucket[]>(() => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (windowDays - 1))

    const counts = new Map<string, Record<StatusKey, number>>()
    for (const o of orders) {
      const d = new Date(o.created_at)
      const key = dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
      const bucket = counts.get(key) || { emProcesso: 0, entregue: 0, cancelado: 0 }
      bucket[statusKey(o.delivery_status)]++
      counts.set(key, bucket)
    }

    return Array.from({ length: windowDays }, (_, i) => {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      const key = dateKey(date)
      const c = counts.get(key) || { emProcesso: 0, entregue: 0, cancelado: 0 }
      return { key, date, ...c, total: c.emProcesso + c.entregue + c.cancelado }
    })
  }, [orders, windowDays])

  const totalInWindow = days.reduce((s, d) => s + d.total, 0)
  const maxValue = Math.max(1, ...days.map(d => d.total))
  const step = niceStep(maxValue)
  const axisMax = Math.ceil(maxValue / step) * step
  const ticks = Array.from({ length: axisMax / step + 1 }, (_, i) => i * step)

  // Geometria do SVG (viewBox fixo; escala com a largura do container).
  const W = 720
  const H = 260
  const PAD_LEFT = 30
  const PAD_RIGHT = 6
  const PAD_TOP = 22
  const PAD_BOTTOM = 26
  const plotW = W - PAD_LEFT - PAD_RIGHT
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const colW = plotW / days.length
  const barW = Math.min(24, colW - 4)
  const yFor = (v: number) => PAD_TOP + plotH - (v / axisMax) * plotH

  // Com muitos dias no eixo, rotula só um a cada N pra não sobrepor texto.
  const labelEvery = days.length > 15 ? Math.ceil(days.length / 10) : 1

  if (orders.length === 0) {
    return (
      <div className="bg-panel rounded-2xl border border-line shadow-sm p-8 flex items-center justify-center">
        <p className="text-sm text-muted">Sem pedidos ainda pra mostrar tendência.</p>
      </div>
    )
  }

  return (
    <div className="bg-panel rounded-2xl border border-line shadow-sm p-4 sm:p-5">
      {/* Cabeçalho: título + total do período + presets de janela */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Pedidos por dia</h2>
          <p className="text-xs text-muted mt-0.5">
            <span className="font-semibold text-muted">{totalInWindow}</span> pedido{totalInWindow !== 1 ? 's' : ''} nos últimos {windowDays} dias
          </p>
        </div>
        <div className="flex items-center gap-1 bg-panel-2 rounded-full p-0.5">
          {WINDOW_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setWindowDays(opt.days)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${windowDays === opt.days ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-muted'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legenda — identidade nunca só por cor, sempre com rótulo de texto ao lado. */}
      <div className="flex items-center gap-4 flex-wrap mb-3">
        {STATUS_ORDER.map(key => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: STATUS_META[key].color }} />
            <span className="text-xs text-muted">{STATUS_META[key].label}</span>
          </div>
        ))}
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" aria-hidden="true">
          {/* Gridlines + rótulos do eixo Y — hairline, recessivo, nunca tracejado. */}
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={yFor(t)} y2={yFor(t)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={yFor(t)} textAnchor="end" dominantBaseline="middle" className="fill-gray-400" fontSize={9}>
                {t}
              </text>
            </g>
          ))}

          {/* Barras empilhadas por dia */}
          {days.map((d, i) => {
            const x = PAD_LEFT + i * colW + (colW - barW) / 2
            let cum = 0
            const segs = STATUS_ORDER.map(key => {
              const value = d[key]
              const y0 = cum
              cum += value
              return { key, value, y0, y1: cum }
            })
            const topSeg = [...segs].reverse().find(s => s.value > 0)
            const isDimmed = hoveredIdx !== null && hoveredIdx !== i

            return (
              <g key={d.key} opacity={isDimmed ? 0.45 : 1} style={{ transition: 'opacity 0.15s' }}>
                {segs.map(s => {
                  if (s.value === 0) return null
                  const rectTopY = yFor(s.y1)
                  const rectBottomY = yFor(s.y0)
                  // Gap de 2px encostado no lado de baixo de cada segmento que tem
                  // outro segmento embaixo — separa os blocos sem precisar de borda.
                  const shrinkBottom = s.y0 > 0 ? 2 : 0
                  const rectH = Math.max(0, rectBottomY - shrinkBottom - rectTopY)
                  const color = STATUS_META[s.key].color

                  return s.key === topSeg?.key ? (
                    <path key={s.key} d={roundedTopRectPath(x, rectTopY, barW, rectH, 4)} fill={color} />
                  ) : (
                    <rect key={s.key} x={x} y={rectTopY} width={barW} height={rectH} fill={color} />
                  )
                })}

                {/* Rótulo seletivo: só o total no topo da coluna, nunca um número
                    por segmento. */}
                {d.total > 0 && (
                  <text x={x + barW / 2} y={yFor(d.total) - 6} textAnchor="middle" className="fill-gray-500" fontSize={9} fontWeight={600}>
                    {d.total}
                  </text>
                )}

                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H - PAD_BOTTOM + 14} textAnchor="middle" className="fill-gray-500" fontSize={9}>
                    {formatDay(d.date)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Overlay HTML: um botão focável por dia (mesmo alvo pro mouse e pro teclado),
            cobrindo a altura do gráfico — a barra em si não precisa ser o alvo exato. */}
        <div
          className="absolute inset-0 flex"
          style={{
            paddingLeft: `${(PAD_LEFT / W) * 100}%`,
            paddingRight: `${(PAD_RIGHT / W) * 100}%`,
            paddingTop: `${(PAD_TOP / H) * 100}%`,
            paddingBottom: `${(PAD_BOTTOM / H) * 100}%`,
          }}
        >
          {days.map((d, i) => (
            <button
              key={d.key}
              type="button"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onFocus={() => setHoveredIdx(i)}
              onBlur={() => setHoveredIdx(null)}
              aria-label={`${WEEKDAYS_SHORT[d.date.getDay()]} ${formatDay(d.date)}: ${d.total} pedido${d.total !== 1 ? 's' : ''} — ${STATUS_META.emProcesso.label} ${d.emProcesso}, ${STATUS_META.entregue.label} ${d.entregue}, ${STATUS_META.cancelado.label} ${d.cancelado}`}
              className="flex-1 h-full bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-sm"
            />
          ))}
        </div>

        {/* Tooltip — uma leitura só, com todas as séries do dia (o ponteiro nunca
            precisa acertar um segmento específico). */}
        {hoveredIdx !== null && (() => {
          const d = days[hoveredIdx]
          const x = PAD_LEFT + hoveredIdx * colW + colW / 2
          const anchorRight = hoveredIdx > (days.length - 1) / 2
          const barTopPct = (yFor(d.total) / H) * 100

          return (
            <div
              className="absolute pointer-events-none bg-void text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10 min-w-[132px]"
              style={{
                left: `${(x / W) * 100}%`,
                top: `${barTopPct}%`,
                transform: `translate(${anchorRight ? '-100%' : '0%'}, calc(-100% - 8px))`,
              }}
            >
              <p className="font-semibold mb-1.5">{WEEKDAYS_SHORT[d.date.getDay()]}, {formatDay(d.date)}</p>
              {STATUS_ORDER.map(key => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted">
                    <span className="w-2 h-0.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_META[key].color }} />
                    {STATUS_META[key].label}
                  </span>
                  <span className="font-semibold tabular-nums">{d[key]}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 mt-1.5 pt-1.5 border-t border-white/15">
                <span className="text-muted">Total</span>
                <span className="font-semibold tabular-nums">{d.total}</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Tabela — mesmo dado em texto puro, fonte de verdade acessível (leitor de
          tela, ou quem só quer os números). */}
      <button
        type="button"
        onClick={() => setShowTable(v => !v)}
        className="text-xs font-medium text-accent-2 hover:text-accent-2 mt-3"
      >
        {showTable ? 'Ocultar tabela' : 'Ver como tabela'}
      </button>

      {showTable && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-1.5 font-medium text-muted">Dia</th>
                {STATUS_ORDER.map(key => (
                  <th key={key} className="text-right py-1.5 font-medium text-muted">{STATUS_META[key].label}</th>
                ))}
                <th className="text-right py-1.5 font-medium text-muted">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {days.map(d => (
                <tr key={d.key}>
                  <td className="py-1.5 text-muted font-medium">{WEEKDAYS_SHORT[d.date.getDay()]} {formatDay(d.date)}</td>
                  {STATUS_ORDER.map(key => (
                    <td key={key} className="py-1.5 text-right text-muted tabular-nums">{d[key]}</td>
                  ))}
                  <td className="py-1.5 text-right text-ink font-semibold tabular-nums">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
