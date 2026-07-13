'use client'

import { useMemo, useState } from 'react'

interface ChartOrder {
  created_at: string
  delivery_status: string
}

interface SeriesCounts {
  emProcesso: number
  entregue: number
  cancelado: number
}

interface PeriodBucket extends SeriesCounts {
  key: string
  label: string
}

const SERIES: { key: keyof SeriesCounts; label: string; color: string }[] = [
  { key: 'emProcesso', label: 'Em processo', color: '#fab219' },
  { key: 'entregue', label: 'Entregue', color: '#0ca30c' },
  { key: 'cancelado', label: 'Cancelado', color: '#d03b3b' },
]

function countByStatus(orders: ChartOrder[]): SeriesCounts {
  return orders.reduce(
    (acc, o) => {
      if (o.delivery_status === 'delivered') acc.entregue++
      else if (o.delivery_status === 'cancelled') acc.cancelado++
      else acc.emProcesso++
      return acc
    },
    { emProcesso: 0, entregue: 0, cancelado: 0 }
  )
}

/** Degrau "redondo" pro eixo Y (0/5/10/25...) — mesma ideia de um nice-number de eixo.
 * mag nunca fica abaixo de 1: são contagens de pedidos, sempre inteiras. */
function niceStep(max: number, targetTicks = 4) {
  if (max <= 0) return 1
  const rough = max / targetTicks
  const mag = Math.max(1, Math.pow(10, Math.floor(Math.log10(rough))))
  const norm = rough / mag
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10
  return step * mag
}

export default function OrderStatusChart({ orders }: { orders: ChartOrder[] }) {
  const [hovered, setHovered] = useState<{ period: number; series: number } | null>(null)

  const periods = useMemo<PeriodBucket[]>(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    // Semana civil começando na segunda — getDay() 0=domingo..6=sábado.
    const diffToMonday = (startOfToday.getDay() + 6) % 7
    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfToday.getDate() - diffToMonday)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const buckets: { key: string; label: string; from: Date | null }[] = [
      { key: 'today', label: 'Hoje', from: startOfToday },
      { key: 'week', label: 'Semana', from: startOfWeek },
      { key: 'month', label: 'Mês', from: startOfMonth },
      { key: 'all', label: 'Tudo', from: null },
    ]

    return buckets.map(b => {
      const inBucket = b.from ? orders.filter(o => new Date(o.created_at) >= b.from!) : orders
      return { key: b.key, label: b.label, ...countByStatus(inBucket) }
    })
  }, [orders])

  const maxValue = Math.max(1, ...periods.flatMap(p => [p.emProcesso, p.entregue, p.cancelado]))
  const step = niceStep(maxValue)
  const axisMax = Math.ceil(maxValue / step) * step
  const ticks = Array.from({ length: axisMax / step + 1 }, (_, i) => i * step)

  // Geometria do SVG (viewBox fixo; escala com a largura do container).
  const W = 480
  const H = 220
  const PAD_LEFT = 28
  const PAD_BOTTOM = 24
  const PAD_TOP = 10
  const plotW = W - PAD_LEFT - 8
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const groupW = plotW / periods.length
  const barW = 16
  const barGap = 2

  const yFor = (value: number) => PAD_TOP + plotH - (value / axisMax) * plotH

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Pedidos por status e período</h2>
          <p className="text-xs text-gray-500 mt-0.5">Contagem por data de criação do pedido</p>
        </div>
        {/* Legenda — sempre presente com 3 séries, cor nunca carrega o texto. */}
        <div className="flex items-center gap-4 flex-wrap">
          {SERIES.map(s => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-gray-600">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" aria-hidden="true">
          {/* Gridlines + rótulos do eixo Y */}
          {ticks.map(t => (
            <g key={t}>
              <line
                x1={PAD_LEFT} x2={W - 8} y1={yFor(t)} y2={yFor(t)}
                stroke="#e5e7eb" strokeWidth={1}
              />
              <text x={PAD_LEFT - 6} y={yFor(t)} textAnchor="end" dominantBaseline="middle" className="fill-gray-400" fontSize={9}>
                {t}
              </text>
            </g>
          ))}

          {/* Grupos de barras */}
          {periods.map((p, pi) => {
            const groupX = PAD_LEFT + pi * groupW
            const groupCenter = groupX + groupW / 2
            const totalBarsW = SERIES.length * barW + (SERIES.length - 1) * barGap
            const startX = groupCenter - totalBarsW / 2

            return (
              <g key={p.key}>
                {SERIES.map((s, si) => {
                  const value = p[s.key]
                  const x = startX + si * (barW + barGap)
                  const y = yFor(value)
                  const height = Math.max(0, PAD_TOP + plotH - y)
                  const isHovered = hovered?.period === pi && hovered?.series === si
                  return (
                    <rect
                      key={s.key}
                      x={x}
                      y={y}
                      width={barW}
                      height={height}
                      rx={4}
                      fill={s.color}
                      opacity={isHovered ? 1 : 0.9}
                      style={{ cursor: 'pointer', transition: 'opacity 0.1s' }}
                      onMouseEnter={() => setHovered({ period: pi, series: si })}
                      onMouseLeave={() => setHovered(null)}
                    />
                  )
                })}
                <text
                  x={groupCenter}
                  y={H - PAD_BOTTOM + 14}
                  textAnchor="middle"
                  className="fill-gray-600"
                  fontSize={10}
                  fontWeight={600}
                >
                  {p.label}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Tooltip — posicionado em % sobre o mesmo viewBox do SVG, acompanha a barra. */}
        {hovered && (() => {
          const p = periods[hovered.period]
          const s = SERIES[hovered.series]
          const value = p[s.key]
          const groupX = PAD_LEFT + hovered.period * groupW
          const groupCenter = groupX + groupW / 2
          const totalBarsW = SERIES.length * barW + (SERIES.length - 1) * barGap
          const startX = groupCenter - totalBarsW / 2
          const barCenterX = startX + hovered.series * (barW + barGap) + barW / 2
          const barTopY = yFor(value)
          return (
            <div
              className="absolute pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
              style={{
                left: `${(barCenterX / W) * 100}%`,
                top: `${(barTopY / H) * 100}%`,
                transform: 'translate(-50%, -110%)',
              }}
            >
              <span className="font-semibold">{value}</span> {s.label.toLowerCase()} · {p.label.toLowerCase()}
            </div>
          )
        })()}
      </div>

      {/* Tabela — mesmo dado em texto puro, fonte de verdade acessível (leitor de tela,
          quem não consegue ler o gráfico). */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-1.5 font-medium text-gray-500">Período</th>
              {SERIES.map(s => (
                <th key={s.key} className="text-right py-1.5 font-medium text-gray-500">{s.label}</th>
              ))}
              <th className="text-right py-1.5 font-medium text-gray-500">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {periods.map(p => (
              <tr key={p.key}>
                <td className="py-1.5 text-gray-700 font-medium">{p.label}</td>
                {SERIES.map(s => (
                  <td key={s.key} className="py-1.5 text-right text-gray-700 tabular-nums">{p[s.key]}</td>
                ))}
                <td className="py-1.5 text-right text-gray-900 font-semibold tabular-nums">
                  {p.emProcesso + p.entregue + p.cancelado}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
