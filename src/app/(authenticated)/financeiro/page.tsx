'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  CurrencyDollar, TrendUp, TrendDown, Wallet, ShoppingCart, Receipt,
  WarningCircle, CaretRight, Package, Plus, X, Check, Motorcycle,
} from '@phosphor-icons/react'
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_OPTIONS } from '@/lib/expense-categories'

type Period = 'day' | 'week' | 'month'

interface SummaryData {
  period: { type: Period; from: string; to: string }
  revenue: { total: string; orders_count: number }
  inflow: string
  outflow: string
  balance: string
  accumulated_balance: string
  sales_today_count: number
  expenses_today_total: string
  liabilities: {
    month_total: string
    overdue_total: string
    upcoming: { id: string; description: string; category: string; amount: string; due_date: string; effective_status: string }[]
  }
  cash_pending: {
    total: string
    count: number
    orders: { id: string; customer_name: string | null; total_value: string; created_at: string }[]
  }
  time_series: { date: string; inflow: string; outflow: string; sales_count: number }[]
  payment_methods: { method: string; total: string; pct: number }[]
  expenses_by_category: { category: string; total: string; pct: number }[]
}

interface Order {
  id: string
  customer_name: string | null
  payment_method: string
  payment_status: string
  total_value: string
  created_at: string
  items: { product_name: string; quantity: number; unit_price: string }[]
}

interface ExpenseLite {
  id: string
  description: string
  category: string
  amount: string
  status: string
  paid_at: string | null
  due_date: string
}

interface Movement {
  id: string
  label: string
  sublabel: string
  amount: number
  isOutflow: boolean
  date: string
}

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Hoje' },
  { id: 'week', label: 'Últimos 7 dias' },
  { id: 'month', label: 'Este mês' },
]

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  boleto: 'Boleto Bancário',
  dinheiro: 'Dinheiro',
}

function formatCurrency(value: number | string) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatBucketLabel(iso: string, bucketType: 'hour' | 'day') {
  const d = new Date(iso)
  return bucketType === 'hour' ? `${d.getHours()}h` : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function EmptyChartState({ label }: { label: string }) {
  return <div className="flex items-center justify-center h-28 text-sm text-gray-400">{label}</div>
}

function tooltipAlignClass(i: number, length: number) {
  if (i <= 1) return 'left-0'
  if (i >= length - 2) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}

function CashFlowChart({ data, bucketType }: { data: SummaryData['time_series']; bucketType: 'hour' | 'day' }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const zoneHeight = 90

  if (data.length === 0 || data.every(d => Number(d.inflow) === 0 && Number(d.outflow) === 0)) {
    return <EmptyChartState label="Sem movimentações no período" />
  }

  const maxValue = Math.max(1, ...data.flatMap(d => [Number(d.inflow), Number(d.outflow)]))

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-xs font-medium text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-600" /> Entradas</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-600" /> Saídas</span>
      </div>
      <div className="flex items-stretch" style={{ height: zoneHeight * 2 }} onMouseLeave={() => setHoverIdx(null)}>
        {data.map((d, i) => {
          const inflowPct = (Number(d.inflow) / maxValue) * 100
          const outflowPct = (Number(d.outflow) / maxValue) * 100
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center relative min-w-[4px]"
              onMouseEnter={() => setHoverIdx(i)}
              onFocus={() => setHoverIdx(i)}
              tabIndex={0}
            >
              <div className="w-full flex items-end justify-center" style={{ height: zoneHeight }}>
                <div
                  className={`w-full max-w-[20px] rounded-t transition-colors ${hoverIdx === i ? 'bg-green-700' : 'bg-green-600'}`}
                  style={{ height: `${inflowPct}%` }}
                />
              </div>
              <div className="w-full border-t border-gray-200" />
              <div className="w-full flex items-start justify-center" style={{ height: zoneHeight }}>
                <div
                  className={`w-full max-w-[20px] rounded-b transition-colors ${hoverIdx === i ? 'bg-red-700' : 'bg-red-600'}`}
                  style={{ height: `${outflowPct}%` }}
                />
              </div>
              {hoverIdx === i && (
                <div className={`absolute bottom-full mb-2 ${tooltipAlignClass(i, data.length)} z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none`}>
                  <p className="font-semibold mb-1">{formatBucketLabel(d.date, bucketType)}</p>
                  <p><span className="text-green-400">Entradas:</span> {formatCurrency(d.inflow)}</p>
                  <p><span className="text-red-400">Saídas:</span> {formatCurrency(d.outflow)}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex text-[11px] text-gray-400 mt-2">
        {data.map((d, i) => {
          const showLabel = i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)
          return <div key={d.date} className="flex-1 text-center">{showLabel ? formatBucketLabel(d.date, bucketType) : ''}</div>
        })}
      </div>
    </div>
  )
}

function SalesCountChart({ data, bucketType }: { data: SummaryData['time_series']; bucketType: 'hour' | 'day' }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const height = 100

  if (data.length === 0 || data.every(d => d.sales_count === 0)) {
    return <EmptyChartState label="Nenhuma venda no período" />
  }

  const maxValue = Math.max(1, ...data.map(d => d.sales_count))

  return (
    <div>
      <div className="flex items-end" style={{ height }} onMouseLeave={() => setHoverIdx(null)}>
        {data.map((d, i) => {
          const pct = (d.sales_count / maxValue) * 100
          return (
            <div
              key={d.date}
              className="flex-1 h-full flex items-end justify-center relative min-w-[4px]"
              onMouseEnter={() => setHoverIdx(i)}
              onFocus={() => setHoverIdx(i)}
              tabIndex={0}
            >
              <div
                className={`w-full max-w-[20px] rounded-t transition-colors ${hoverIdx === i ? 'bg-blue-700' : 'bg-blue-600'}`}
                style={{ height: `${Math.max(pct, d.sales_count > 0 ? 4 : 0)}%` }}
              />
              {hoverIdx === i && (
                <div className={`absolute bottom-full mb-2 ${tooltipAlignClass(i, data.length)} z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none`}>
                  <p className="font-semibold">{formatBucketLabel(d.date, bucketType)}</p>
                  <p>{d.sales_count} venda{d.sales_count !== 1 ? 's' : ''}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex text-[11px] text-gray-400 mt-2">
        {data.map((d, i) => {
          const showLabel = i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)
          return <div key={d.date} className="flex-1 text-center">{showLabel ? formatBucketLabel(d.date, bucketType) : ''}</div>
        })}
      </div>
    </div>
  )
}

function todayInputDate() {
  const d = new Date()
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10)
}

function QuickExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('outros')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!description.trim()) { setError('Descrição é obrigatória.'); return }
    const value = parseFloat(amount.replace(',', '.'))
    if (isNaN(value) || value <= 0) { setError('Valor inválido.'); return }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), category, amount: value, due_date: todayInputDate(), status: 'paid' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar')
      }
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Registrar gasto de hoje</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">O que foi? *</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Pote para embalagem"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
              <input
                type="number" step="0.01" min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <input
                list="quick-category-options"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <datalist id="quick-category-options">
                {EXPENSE_CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </datalist>
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Check size={16} />
            {saving ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FinanceiroPage() {
  const [period, setPeriod] = useState<Period>('day')
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [paidExpenses, setPaidExpenses] = useState<ExpenseLite[]>([])
  const [movementsLoading, setMovementsLoading] = useState(true)
  const [showQuickExpense, setShowQuickExpense] = useState(false)

  const fetchSummary = async () => {
    const res = await fetch(`/api/financeiro/summary?period=${period}`)
    if (res.ok) { const { data } = await res.json(); setSummary(data) }
  }

  const fetchMovements = async () => {
    const [ordersRes, expensesRes] = await Promise.all([
      fetch('/api/orders?limit=100').then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
      fetch('/api/expenses?status=paid&limit=50').then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
    ])
    setOrders(ordersRes.data || [])
    setPaidExpenses(expensesRes.data || [])
  }

  useEffect(() => {
    setSummaryLoading(true)
    fetch(`/api/financeiro/summary?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => setSummary(res?.data || null))
      .catch(() => {})
      .finally(() => setSummaryLoading(false))
  }, [period])

  useEffect(() => {
    setMovementsLoading(true)
    fetchMovements().finally(() => setMovementsLoading(false))
  }, [])

  const markExpensePaid = async (id: string) => {
    await fetch(`/api/expenses/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paid' }) })
    await Promise.all([fetchSummary(), fetchMovements()])
  }

  const markCashSettled = async (id: string) => {
    await fetch(`/api/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cash_settled: true }) })
    await fetchSummary()
  }

  const handleQuickExpenseSaved = async () => {
    await Promise.all([fetchSummary(), fetchMovements()])
  }

  const movements: Movement[] = useMemo(() => {
    const orderMovements: Movement[] = orders
      .filter(o => o.payment_status === 'paid' || o.payment_status === 'refunded')
      .map(o => {
        const mainProduct = o.items[0]?.product_name || 'Pedido'
        const extraCount = o.items.length - 1
        return {
          id: `order-${o.id}`,
          label: mainProduct + (extraCount > 0 ? ` +${extraCount}` : ''),
          sublabel: `${o.customer_name || 'Cliente'} · ${PAYMENT_METHOD_LABELS[o.payment_method] || o.payment_method}`,
          amount: Number(o.total_value),
          isOutflow: o.payment_status === 'refunded',
          date: o.created_at,
        }
      })
    const expenseMovements: Movement[] = paidExpenses.map(e => ({
      id: `expense-${e.id}`,
      label: e.description,
      sublabel: EXPENSE_CATEGORY_LABELS[e.category] || e.category,
      amount: Number(e.amount),
      isOutflow: true,
      date: e.paid_at || e.due_date,
    }))
    return [...orderMovements, ...expenseMovements]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50)
  }, [orders, paidExpenses])

  const bucketType: 'hour' | 'day' = period === 'day' ? 'hour' : 'day'

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <CurrencyDollar size={28} className="text-green-600" weight="fill" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
            <p className="text-sm text-gray-500">Acompanhe as vendas e as saídas da empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === opt.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {summaryLoading && !summary ? (
        <div className="flex items-center justify-center h-48 text-gray-400">Carregando...</div>
      ) : summary && (
        <>
          {/* Fixos do dia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShoppingCart size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 leading-tight">{summary.sales_today_count}</p>
                <p className="text-xs text-gray-500">venda{summary.sales_today_count !== 1 ? 's' : ''} hoje</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Receipt size={18} className="text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-gray-900 leading-tight">{formatCurrency(summary.expenses_today_total)}</p>
                <p className="text-xs text-gray-500">gastos hoje</p>
              </div>
              <button
                onClick={() => setShowQuickExpense(true)}
                title="Registrar gasto de hoje"
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">Faturamento</span>
                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
                  <TrendUp size={18} className="text-green-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.revenue.total)}</p>
              <p className="text-xs text-gray-400 mt-1">{summary.revenue.orders_count} pedido{summary.revenue.orders_count !== 1 ? 's' : ''} pago{summary.revenue.orders_count !== 1 ? 's' : ''}</p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">Entradas</span>
                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
                  <TrendUp size={18} className="text-green-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.inflow)}</p>
              <p className="text-xs text-gray-400 mt-1">no período selecionado</p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">Saídas</span>
                <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center">
                  <TrendDown size={18} className="text-red-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.outflow)}</p>
              <p className="text-xs text-gray-400 mt-1">despesas + reembolsos</p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">Saldo</span>
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Wallet size={18} className="text-blue-600" />
                </div>
              </div>
              <p className={`text-2xl font-bold ${Number(summary.accumulated_balance) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {formatCurrency(summary.accumulated_balance)}
              </p>
              <p className="text-xs text-gray-400 mt-1">desde o início</p>
            </div>
          </div>

          {/* Fluxo de caixa */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Fluxo de caixa</h2>
            <p className="text-xs text-gray-400 mb-4">Entradas e saídas ao longo do período</p>
            <CashFlowChart data={summary.time_series} bucketType={bucketType} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Vendas por período */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Vendas no período</h2>
                <SalesCountChart data={summary.time_series} bucketType={bucketType} />
              </div>

              {/* Movimentações */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-base font-semibold text-gray-900">Movimentações</h2>
                </div>
                {movementsLoading ? (
                  <div className="flex items-center justify-center h-48 text-gray-400">Carregando...</div>
                ) : movements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <Package size={32} className="text-gray-300" />
                    <p className="text-gray-400 text-sm">Nenhuma movimentação ainda</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
                    {movements.map(m => (
                      <div key={m.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{m.label}</p>
                          <p className="text-xs text-gray-400">{m.sublabel}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${m.isOutflow ? 'text-red-500' : 'text-green-600'}`}>
                            {m.isOutflow ? '−' : '+'}{formatCurrency(m.amount)}
                          </p>
                          <p className="text-xs text-gray-400">{formatDate(m.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Side Panel */}
            <div className="space-y-4">
              {/* Passivo do mês */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">Passivo do mês</h2>
                  <Link href="/financeiro/contas-a-pagar" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 flex-shrink-0">
                    Gerenciar <CaretRight size={12} />
                  </Link>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(summary.liabilities.month_total)}</p>
                <p className="text-xs text-gray-400 mb-4">em aberto este mês</p>

                {Number(summary.liabilities.overdue_total) > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
                    <WarningCircle size={16} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-700"><span className="font-semibold">{formatCurrency(summary.liabilities.overdue_total)}</span> vencido{Number(summary.liabilities.overdue_total) !== 0 ? '(s)' : ''}</p>
                  </div>
                )}

                {summary.liabilities.upcoming.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhuma conta pendente</p>
                ) : (
                  <div className="space-y-1">
                    {summary.liabilities.upcoming.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 truncate">{item.description}</p>
                          <p className={`text-xs ${item.effective_status === 'overdue' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            {item.effective_status === 'overdue' ? 'Venceu em ' : 'Vence em '}{formatDate(item.due_date)}
                          </p>
                        </div>
                        <button onClick={() => markExpensePaid(item.id)} className="text-xs font-medium text-green-600 hover:text-green-700 flex-shrink-0">
                          Marcar pago
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Dinheiro pendente de repasse — o motoboy recebe em espécie na entrega,
                  esse dinheiro só entra de fato quando ele repassa pra empresa. */}
              {Number(summary.cash_pending.total) > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Motorcycle size={18} className="text-orange-500" />
                    <h2 className="text-base font-semibold text-gray-900">Dinheiro pendente de repasse</h2>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(summary.cash_pending.total)}</p>
                  <p className="text-xs text-gray-400 mb-4">
                    {summary.cash_pending.count} pedido{summary.cash_pending.count !== 1 ? 's' : ''} em dinheiro ainda com o motoboy
                  </p>
                  <div className="space-y-1">
                    {summary.cash_pending.orders.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 truncate">{item.customer_name || 'Cliente'}</p>
                          <p className="text-xs text-gray-400">{formatDate(item.created_at)} · {formatCurrency(item.total_value)}</p>
                        </div>
                        <button onClick={() => markCashSettled(item.id)} className="text-xs font-medium text-green-600 hover:text-green-700 flex-shrink-0">
                          Marcar repassado
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Methods Breakdown */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Por forma de pagamento</h2>
                {summary.payment_methods.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum pagamento no período</p>
                ) : (
                  <div className="space-y-3">
                    {summary.payment_methods.map(({ method, total, pct }) => (
                      <div key={method}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">{PAYMENT_METHOD_LABELS[method] || method}</span>
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(total)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}% do faturamento</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Despesas por categoria */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Despesas por categoria</h2>
                {summary.expenses_by_category.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhuma despesa paga no período</p>
                ) : (
                  <div className="space-y-3">
                    {summary.expenses_by_category.map(({ category, total, pct }) => (
                      <div key={category}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">{EXPENSE_CATEGORY_LABELS[category] || category}</span>
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(total)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}% das saídas</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {showQuickExpense && (
        <QuickExpenseModal onClose={() => setShowQuickExpense(false)} onSaved={handleQuickExpenseSaved} />
      )}
    </div>
  )
}
