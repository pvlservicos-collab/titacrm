'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Receipt, Plus, PencilSimple, Trash, X, Check, CheckCircle,
  Clock, WarningCircle, ArrowsClockwise, ArrowCounterClockwise,
} from '@phosphor-icons/react'
import { EXPENSE_CATEGORY_OPTIONS, EXPENSE_CATEGORY_LABELS } from '@/lib/expense-categories'

interface Expense {
  id: string
  description: string
  category: string
  amount: string
  due_date: string
  status: 'pending' | 'paid' | 'cancelled'
  effective_status: 'pending' | 'paid' | 'cancelled' | 'overdue'
  payee: string | null
  notes: string | null
  is_recurring: boolean
  recurrence_interval: string | null
  recurrence_end_date: string | null
  parent_expense_id: string | null
}

const RECURRENCE_LABELS: Record<string, string> = { weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' }

const STATUS_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'paid', label: 'Pagas' },
] as const

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function toInputDate(iso: string) {
  return iso.slice(0, 10)
}

interface FormState {
  description: string
  category: string
  amount: string
  due_date: string
  payee: string
  notes: string
  is_recurring: boolean
  recurrence_interval: string
  recurrence_end_date: string
  already_paid: boolean
}

function todayInputDate() {
  const d = new Date()
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10)
}

const DEFAULT_FORM: FormState = {
  description: '', category: 'outros', amount: '', due_date: '',
  payee: '', notes: '', is_recurring: false, recurrence_interval: 'monthly', recurrence_end_date: '',
  already_paid: false,
}

const STATUS_BADGE: Record<string, { label: string; className: string; icon: any }> = {
  pending: { label: 'Pendente', className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
  overdue: { label: 'Vencida', className: 'bg-red-50 text-red-700 border-red-200', icon: WarningCircle },
  paid: { label: 'Paga', className: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
  cancelled: { label: 'Cancelada', className: 'bg-panel-2 text-muted border-line', icon: X },
}

export default function ContasAPagarPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]['id']>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchExpenses = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/expenses?limit=300')
      if (res.ok) {
        const { data } = await res.json()
        setExpenses(data || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchExpenses() }, [])

  const filteredExpenses = useMemo(() => {
    if (filter === 'all') return expenses
    return expenses.filter(e => e.effective_status === filter)
  }, [expenses, filter])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...DEFAULT_FORM, due_date: todayInputDate() })
    setError(null)
    setShowModal(true)
  }

  const openEdit = (expense: Expense) => {
    setEditing(expense)
    setForm({
      description: expense.description,
      category: expense.category,
      amount: Number(expense.amount).toFixed(2),
      due_date: toInputDate(expense.due_date),
      payee: expense.payee || '',
      notes: expense.notes || '',
      is_recurring: expense.is_recurring,
      recurrence_interval: expense.recurrence_interval || 'monthly',
      recurrence_end_date: expense.recurrence_end_date ? toInputDate(expense.recurrence_end_date) : '',
      already_paid: false,
    })
    setError(null)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.description.trim()) { setError('Descrição é obrigatória.'); return }
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) { setError('Valor inválido.'); return }
    if (!form.due_date) { setError('Data de vencimento é obrigatória.'); return }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, any> = {
        description: form.description.trim(),
        category: form.category,
        amount,
        due_date: form.due_date,
        payee: form.payee.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (!editing) {
        payload.is_recurring = form.is_recurring
        if (form.is_recurring) {
          payload.recurrence_interval = form.recurrence_interval
          if (form.recurrence_end_date) payload.recurrence_end_date = form.recurrence_end_date
        } else if (form.already_paid) {
          payload.status = 'paid'
        }
      } else if (editing.is_recurring) {
        payload.recurrence_end_date = form.recurrence_end_date || null
      }

      const res = editing
        ? await fetch(`/api/expenses/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar')
      }
      await fetchExpenses()
      setShowModal(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (expense: Expense) => {
    const newStatus = expense.status === 'paid' ? 'pending' : 'paid'
    setBusyId(expense.id)
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) await fetchExpenses()
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (expense: Expense) => {
    if (!confirm(`Excluir "${expense.description}"?`)) return
    setBusyId(expense.id)
    try {
      await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' })
      setExpenses(prev => prev.filter(e => e.id !== expense.id))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Receipt size={26} className="text-red-500" weight="fill" />
          <div>
            <h1 className="text-xl font-bold text-ink">Contas a pagar</h1>
            <p className="text-sm text-muted mt-0.5">Gerencie despesas pontuais e recorrentes</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-2 transition-colors"
        >
          <Plus size={16} />
          Nova despesa
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filter === f.id ? 'bg-void text-white border-line' : 'bg-panel text-muted border-line hover:border-line'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted">Carregando...</div>
      ) : filteredExpenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 bg-panel rounded-2xl border border-line">
          <Receipt size={40} className="text-muted" />
          <p className="text-muted">Nenhuma despesa encontrada</p>
          <button onClick={openCreate} className="text-sm text-accent-2 hover:underline">Lançar primeira despesa</button>
        </div>
      ) : (
        <>
        {/* Mobile: lista de cartões */}
        <div className="md:hidden space-y-3">
          {filteredExpenses.map(expense => {
            const badge = STATUS_BADGE[expense.effective_status]
            const BadgeIcon = badge.icon
            return (
              <div key={expense.id} className="bg-panel rounded-2xl border border-line shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink text-sm truncate">{expense.description}</p>
                      {(expense.is_recurring || expense.parent_expense_id) && (
                        <ArrowsClockwise size={14} className="text-accent-2 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">{EXPENSE_CATEGORY_LABELS[expense.category] || expense.category} · vence {formatDate(expense.due_date)}</p>
                  </div>
                  <p className="text-sm font-semibold text-ink flex-shrink-0">{formatCurrency(expense.amount)}</p>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${badge.className}`}>
                    <BadgeIcon size={13} />
                    {badge.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {expense.status !== 'cancelled' && (
                      <button
                        onClick={() => handleToggleStatus(expense)}
                        disabled={busyId === expense.id}
                        title={expense.status === 'paid' ? 'Reabrir' : 'Marcar como pago'}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                          expense.status === 'paid' ? 'text-muted hover:text-yellow-600 hover:bg-yellow-50' : 'text-muted hover:text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {expense.status === 'paid' ? <ArrowCounterClockwise size={16} /> : <CheckCircle size={16} />}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(expense)}
                      className="p-1.5 text-muted hover:text-accent-2 hover:bg-panel-2 rounded-lg transition-colors"
                    >
                      <PencilSimple size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(expense)}
                      disabled={busyId === expense.id}
                      className="p-1.5 text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop: tabela */}
        <div className="hidden md:block bg-panel rounded-2xl border border-line overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-void">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Descrição</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Categoria</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Vencimento</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Valor</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredExpenses.map(expense => {
                const badge = STATUS_BADGE[expense.effective_status]
                const BadgeIcon = badge.icon
                return (
                  <tr key={expense.id} className="hover:bg-void transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-ink text-sm">{expense.description}</p>
                        {(expense.is_recurring || expense.parent_expense_id) && (
                          <span title={expense.is_recurring ? `Recorrente (${RECURRENCE_LABELS[expense.recurrence_interval || ''] || ''})` : 'Parcela de despesa recorrente'}>
                            <ArrowsClockwise size={14} className="text-accent-2" />
                          </span>
                        )}
                      </div>
                      {expense.payee && <p className="text-xs text-muted mt-0.5">{expense.payee}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-muted">{EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-muted">{formatDate(expense.due_date)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-ink">{formatCurrency(expense.amount)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${badge.className}`}>
                        <BadgeIcon size={13} />
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 justify-end">
                        {expense.status !== 'cancelled' && (
                          <button
                            onClick={() => handleToggleStatus(expense)}
                            disabled={busyId === expense.id}
                            title={expense.status === 'paid' ? 'Reabrir' : 'Marcar como pago'}
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                              expense.status === 'paid' ? 'text-muted hover:text-yellow-600 hover:bg-yellow-50' : 'text-muted hover:text-green-600 hover:bg-green-50'
                            }`}
                          >
                            {expense.status === 'paid' ? <ArrowCounterClockwise size={16} /> : <CheckCircle size={16} />}
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(expense)}
                          className="p-1.5 text-muted hover:text-accent-2 hover:bg-panel-2 rounded-lg transition-colors"
                        >
                          <PencilSimple size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(expense)}
                          disabled={busyId === expense.id}
                          className="p-1.5 text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-panel rounded-2xl w-full max-w-md shadow-2xl border border-line max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="text-base font-bold text-ink">
                {editing ? 'Editar despesa' : 'Nova despesa'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-muted transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Descrição *</label>
                <input
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Ex: Aluguel loja centro"
                  className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Categoria</label>
                  <input
                    list="category-options"
                    value={form.category}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                  />
                  <datalist id="category-options">
                    {EXPENSE_CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Valor (R$) *</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Vencimento *</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Fornecedor/Beneficiário</label>
                  <input
                    value={form.payee}
                    onChange={e => setForm(p => ({ ...p, payee: e.target.value }))}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                  />
                </div>
              </div>

              {!editing && (
                <div className="flex items-center gap-5">
                  {!form.already_paid && (
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.is_recurring}
                        onChange={e => setForm(p => ({ ...p, is_recurring: e.target.checked }))}
                        className="w-4 h-4 rounded border-line text-accent-2 focus:ring-accent"
                      />
                      <span className="text-sm font-medium text-muted">Despesa recorrente</span>
                    </label>
                  )}
                  {!form.is_recurring && (
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.already_paid}
                        onChange={e => setForm(p => ({ ...p, already_paid: e.target.checked }))}
                        className="w-4 h-4 rounded border-line text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm font-medium text-muted">Já paguei essa despesa</span>
                    </label>
                  )}
                </div>
              )}

              {(form.is_recurring && !editing) || (editing?.is_recurring) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1 border-l-2 border-accent-line">
                  <div className="pl-3">
                    <label className="block text-sm font-medium text-muted mb-1">Intervalo</label>
                    <select
                      value={form.recurrence_interval}
                      onChange={e => setForm(p => ({ ...p, recurrence_interval: e.target.value }))}
                      disabled={!!editing}
                      className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-void disabled:text-muted"
                    >
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">Repetir até</label>
                    <input
                      type="date"
                      value={form.recurrence_end_date}
                      onChange={e => setForm(p => ({ ...p, recurrence_end_date: e.target.value }))}
                      placeholder="Sem fim"
                      className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Observações</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder="Opcional..."
                  className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent resize-none"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-line">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted hover:text-ink transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-2 disabled:opacity-50 transition-colors"
              >
                <Check size={16} />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
