'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Truck, Package, CurrencyDollar, Clock, MagnifyingGlass, Plus, Trash, WhatsappLogo } from '@phosphor-icons/react'
import { useAuth } from '@/hooks'
import NotAuthorized from '@/components/Shared/NotAuthorized'
import NovoPedidoModal from './NovoPedidoModal'
import OrderDetailModal from './OrderDetailModal'
import { buildDeliveryWhatsAppLink } from './whatsapp'
import { PAYMENT_STATUS_META, DELIVERY_STATUS_META, StatusTone } from '@/lib/orderStatus'

interface OrderItem {
  id: string
  product_name: string
  quantity: number
  unit_price: string
}

interface Order {
  id: string
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  customer_cpf: string | null
  customer_cep: string | null
  customer_address: string | null
  customer_address_number: string | null
  customer_address_complement: string | null
  customer_neighborhood: string | null
  customer_city: string | null
  customer_state: string | null
  payment_method: string
  payment_status: string
  delivery_status: string
  total_value: string
  created_at: string
  delivered_at: string | null
  cash_settled: boolean
  cash_settled_at: string | null
  items: OrderItem[]
}

const TONE_CLASSES: Record<StatusTone, string> = {
  warning: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  success: 'text-green-400 bg-green-400/10 border-green-400/30',
  danger: 'text-red-400 bg-red-400/10 border-red-400/30',
  info: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
}

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = Object.fromEntries(
  Object.entries(PAYMENT_STATUS_META).map(([value, meta]) => [value, { label: meta.label, color: TONE_CLASSES[meta.tone] }])
)

const DELIVERY_STATUS_LABELS: Record<string, { label: string; color: string }> = Object.fromEntries(
  Object.entries(DELIVERY_STATUS_META).map(([value, meta]) => [value, { label: meta.label, color: TONE_CLASSES[meta.tone] }])
)

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
}

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function LogisticaPage() {
  const { loading: authLoading, permissions, isMaster, roleName } = useAuth()
  const isAdmin = isMaster || roleName?.toLowerCase() === 'administrador' || roleName?.toLowerCase() === 'owner'
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [paymentFilter, setPaymentFilter] = useState<string>('')
  // Aba padrão é "pending" — o entregador usa essa tela pra saber o que falta entregar,
  // e pedido já entregue misturado na lista tava confundindo.
  const [activeTab, setActiveTab] = useState<'pending' | 'delivered'>('pending')
  // Permite abrir a Logística já filtrada (ex: link "Ver todos os pedidos" no perfil do Chat)
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null)
  const [deletingOrder, setDeletingOrder] = useState<string | null>(null)
  const [showNewOrder, setShowNewOrder] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (paymentFilter) params.set('payment_status', paymentFilter)
      const res = await fetch(`/api/orders?${params}`)
      if (res.ok) {
        const { data } = await res.json()
        setOrders(data || [])
      }
    } finally {
      setLoading(false)
    }
  }, [paymentFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const handleDeliveryChange = async (orderId: string, newStatus: string) => {
    setUpdatingOrder(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_status: newStatus }),
      })
      if (res.ok) {
        const { data } = await res.json()
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, delivery_status: newStatus, delivered_at: data.delivered_at } : o))
      }
    } finally {
      setUpdatingOrder(null)
    }
  }

  const handlePaymentChange = async (orderId: string, newStatus: string) => {
    setUpdatingOrder(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: newStatus }),
      })
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_status: newStatus } : o))
      }
    } finally {
      setUpdatingOrder(null)
    }
  }

  const handleDelete = async (order: Order) => {
    if (!confirm(`Excluir o pedido de "${order.customer_name || 'cliente'}"? Ele sai da Logística e do Financeiro.`)) return
    setDeletingOrder(order.id)
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: 'DELETE' })
      if (res.ok) setOrders(prev => prev.filter(o => o.id !== order.id))
    } finally {
      setDeletingOrder(null)
    }
  }

  // "Pendentes" cobre tudo que ainda não foi entregue (pending/picking/picked/shipped e
  // até cancelled) — só delivered vai pra aba separada, é a distinção que importa pro
  // entregador.
  const pendingOrders = orders.filter(o => o.delivery_status !== 'delivered')
  const deliveredOrders = orders.filter(o => o.delivery_status === 'delivered')
  const tabOrders = activeTab === 'pending' ? pendingOrders : deliveredOrders

  const filtered = tabOrders.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.customer_phone || '').includes(q) ||
      o.items.some(i => i.product_name.toLowerCase().includes(q))
    )
  })

  // Summary cards
  const pendingDeliveries = orders.filter(o => o.delivery_status === 'pending').length
  const totalRevenue = orders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + Number(o.total_value), 0)

  if (!authLoading && !isAdmin && permissions && !permissions.settings?.view_logistica) {
    return <NotAuthorized />
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Truck size={28} className="text-blue-600" weight="fill" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Logística</h1>
              <p className="text-sm text-gray-500">Gerencie os pedidos e entregas</p>
            </div>
          </div>
          <button
            onClick={() => setShowNewOrder(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} weight="bold" />
            Novo pedido
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <Truck size={20} className="text-orange-500" />
              </div>
              <span className="text-sm font-medium text-gray-500">Entregas pendentes</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{pendingDeliveries}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <CurrencyDollar size={20} className="text-green-500" />
              </div>
              <span className="text-sm font-medium text-gray-500">Faturamento (pago)</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Package size={20} className="text-blue-500" />
              </div>
              <span className="text-sm font-medium text-gray-500">Total de pedidos</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{orders.length}</p>
          </div>
        </div>

        {/* Abas: pendentes (padrão) vs entregues — evita misturar pedido já entregue
            com o que ainda falta entregar, que era o que confundia o entregador. */}
        <div className="flex items-center gap-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'pending'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
          >
            Pendentes ({pendingOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('delivered')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'delivered'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
          >
            Entregues ({deliveredOrders.length})
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por cliente ou produto..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500">Pagamento:</span>
              {['', 'pending', 'paid', 'refunded'].map(s => (
                <button
                  key={s}
                  onClick={() => setPaymentFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${paymentFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {s === '' ? 'Todos' : PAYMENT_STATUS_LABELS[s]?.label || s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table (desktop) / Cards (mobile) */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center h-48 text-gray-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center h-48 gap-2">
            <Package size={32} className="text-gray-300" />
            <p className="text-gray-400 text-sm">Nenhum pedido encontrado</p>
          </div>
        ) : (
          <>
          {/* Mobile: lista de cartões */}
          <div className="md:hidden space-y-3">
            {filtered.map(order => {
              const payStatus = PAYMENT_STATUS_LABELS[order.payment_status] || { label: order.payment_status, color: 'text-gray-400 bg-gray-100 border-gray-200' }
              const delStatus = DELIVERY_STATUS_LABELS[order.delivery_status] || { label: order.delivery_status, color: 'text-gray-400 bg-gray-100 border-gray-200' }
              const mainProduct = order.items[0]?.product_name || '—'
              const extraItems = order.items.length > 1 ? `+${order.items.length - 1}` : ''
              const whatsappLink = buildDeliveryWhatsAppLink(order)
              return (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => setSelectedOrder(order)} className="text-left min-w-0" title="Ver dados completos do cliente">
                      <p className="font-medium text-gray-900 text-sm truncate">{order.customer_name || '—'}</p>
                      <p className="text-xs text-gray-400">{order.customer_phone || ''}</p>
                    </button>
                    <p className="text-sm font-semibold text-gray-900 flex-shrink-0">{formatCurrency(order.total_value)}</p>
                  </div>

                  <div className="mt-2">
                    <p className="text-sm text-gray-700">{mainProduct}{extraItems ? ` +${extraItems.replace('+', '')}` : ''}</p>
                    <p className="text-xs text-gray-400">{PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method} · {formatDate(order.created_at)}</p>
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <select
                      value={order.payment_status}
                      disabled={updatingOrder === order.id}
                      onChange={e => handlePaymentChange(order.id, e.target.value)}
                      className={`text-xs font-medium px-2 py-1 rounded-full border bg-transparent focus:outline-none cursor-pointer ${payStatus.color}`}
                    >
                      {Object.entries(PAYMENT_STATUS_LABELS).map(([val, { label }]) => (
                        <option key={val} value={val} className="bg-white text-gray-700">{label}</option>
                      ))}
                    </select>
                    <select
                      value={order.delivery_status}
                      disabled={updatingOrder === order.id}
                      onChange={e => handleDeliveryChange(order.id, e.target.value)}
                      className={`text-xs font-medium px-2 py-1 rounded-full border bg-transparent focus:outline-none cursor-pointer ${delStatus.color}`}
                    >
                      {Object.entries(DELIVERY_STATUS_LABELS).map(([val, { label }]) => (
                        <option key={val} value={val} className="bg-white text-gray-700">{label}</option>
                      ))}
                    </select>
                  </div>
                  {order.delivered_at && (
                    <p className="text-[10px] text-gray-400 mt-1">Entregue em {formatDateTime(order.delivered_at)}</p>
                  )}

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                    {whatsappLink && (
                      <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-green-700 bg-green-50 rounded-lg"
                      >
                        <WhatsappLogo size={14} weight="fill" />
                        WhatsApp
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(order)}
                      disabled={deletingOrder === order.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg disabled:opacity-40"
                    >
                      <Trash size={14} />
                      Excluir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pagamento</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Entrega</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(order => {
                  const payStatus = PAYMENT_STATUS_LABELS[order.payment_status] || { label: order.payment_status, color: 'text-gray-400 bg-gray-100 border-gray-200' }
                  const delStatus = DELIVERY_STATUS_LABELS[order.delivery_status] || { label: order.delivery_status, color: 'text-gray-400 bg-gray-100 border-gray-200' }
                  const mainProduct = order.items[0]?.product_name || '—'
                  const extraItems = order.items.length > 1 ? `+${order.items.length - 1}` : ''
                  const whatsappLink = buildDeliveryWhatsAppLink(order)
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4 cursor-pointer hover:bg-blue-50/50 transition-colors" onClick={() => setSelectedOrder(order)} title="Ver dados completos do cliente">
                        <p className="font-medium text-gray-900 text-sm">{order.customer_name || '—'}</p>
                        <p className="text-xs text-gray-400">{order.customer_phone || ''}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-700">{mainProduct}</p>
                        {extraItems && <p className="text-xs text-gray-400">{extraItems} mais</p>}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(order.total_value)}</p>
                        <p className="text-xs text-gray-400">{PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}</p>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={order.payment_status}
                          disabled={updatingOrder === order.id}
                          onChange={e => handlePaymentChange(order.id, e.target.value)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border bg-transparent focus:outline-none cursor-pointer ${payStatus.color}`}
                        >
                          {Object.entries(PAYMENT_STATUS_LABELS).map(([val, { label }]) => (
                            <option key={val} value={val} className="bg-white text-gray-700">{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={order.delivery_status}
                          disabled={updatingOrder === order.id}
                          onChange={e => handleDeliveryChange(order.id, e.target.value)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border bg-transparent focus:outline-none cursor-pointer ${delStatus.color}`}
                        >
                          {Object.entries(DELIVERY_STATUS_LABELS).map(([val, { label }]) => (
                            <option key={val} value={val} className="bg-white text-gray-700">{label}</option>
                          ))}
                        </select>
                        {order.delivered_at && (
                          <p className="text-[10px] text-gray-400 mt-1">Entregue em {formatDateTime(order.delivered_at)}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500">{formatDate(order.created_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 justify-end">
                          {whatsappLink && (
                            <a
                              href={whatsappLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Avisar cliente no WhatsApp"
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                              <WhatsappLogo size={16} weight="fill" />
                            </a>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(order) }}
                            disabled={deletingOrder === order.id}
                            title="Excluir pedido"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
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

        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 text-right">{filtered.length} pedido{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      {showNewOrder && (
        <NovoPedidoModal onClose={() => setShowNewOrder(false)} onSuccess={fetchOrders} />
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdate={(orderId, updates) => setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o))}
        />
      )}
    </div>
  )
}
