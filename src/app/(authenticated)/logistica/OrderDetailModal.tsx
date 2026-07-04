'use client'

import { useState } from 'react'
import { X, MapPin, WhatsappLogo, IdentificationCard, EnvelopeSimple, Phone } from '@phosphor-icons/react'
import { buildDeliveryWhatsAppLink } from './whatsapp'
import { PAYMENT_STATUS_META, DELIVERY_STATUS_META, PAYMENT_METHOD_META, StatusTone } from '@/lib/orderStatus'

const TONE_CLASSES: Record<StatusTone, string> = {
  warning: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  success: 'text-green-400 bg-green-400/10 border-green-400/30',
  danger: 'text-red-400 bg-red-400/10 border-red-400/30',
  info: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
}

interface OrderDetailItem {
  id: string
  product_name: string
  quantity: number
  unit_price: string
}

interface OrderDetail {
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
  items: OrderDetailItem[]
}

const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PAYMENT_METHOD_META).map(([value, meta]) => [value, meta.label])
)

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatAddress(o: OrderDetail): string | null {
  const parts = [
    o.customer_address ? `${o.customer_address}${o.customer_address_number ? `, ${o.customer_address_number}` : ''}` : null,
    o.customer_address_complement,
    o.customer_neighborhood,
    o.customer_city && o.customer_state ? `${o.customer_city}/${o.customer_state}` : (o.customer_city || o.customer_state),
    o.customer_cep ? `CEP ${o.customer_cep}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : null
}

interface OrderDetailModalProps {
  order: OrderDetail
  onClose: () => void
  onUpdate?: (orderId: string, updates: Partial<Pick<OrderDetail, 'payment_status' | 'delivery_status' | 'delivered_at'>>) => void
}

export default function OrderDetailModal({ order: initialOrder, onClose, onUpdate }: OrderDetailModalProps) {
  const [order, setOrder] = useState(initialOrder)
  const [saving, setSaving] = useState(false)
  const address = formatAddress(order)
  const whatsappLink = buildDeliveryWhatsAppLink(order)

  const handleStatusChange = async (field: 'payment_status' | 'delivery_status', value: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        const { data } = await res.json()
        const updates = { [field]: value, ...(field === 'delivery_status' ? { delivered_at: data.delivered_at } : {}) }
        setOrder(prev => ({ ...prev, ...updates }))
        onUpdate?.(order.id, updates)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white border border-gray-100 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{order.customer_name || 'Cliente'}</h2>
            <p className="text-xs text-gray-400">Pedido de {formatDateTime(order.created_at)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Contato */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Contato</p>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Phone size={14} className="text-gray-400 flex-shrink-0" />
              {order.customer_phone || '—'}
            </div>
            {order.customer_email && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <EnvelopeSimple size={14} className="text-gray-400 flex-shrink-0" />
                {order.customer_email}
              </div>
            )}
            {order.customer_cpf && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <IdentificationCard size={14} className="text-gray-400 flex-shrink-0" />
                {order.customer_cpf}
              </div>
            )}
          </div>

          {/* Endereço */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <MapPin size={12} /> Endereço de entrega
            </p>
            <p className="text-sm text-gray-700">{address || 'Endereço não informado'}</p>
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Itens do pedido</p>
            <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
              {order.items.map(item => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-700">{item.product_name} {item.quantity > 1 ? `x${item.quantity}` : ''}</span>
                  <span className="font-medium text-gray-900">{formatCurrency(Number(item.unit_price) * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="text-sm font-semibold text-gray-900">Total</span>
              <span className="text-base font-bold text-gray-900">{formatCurrency(order.total_value)}</span>
            </div>
          </div>

          {/* Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                Pagamento <span className="normal-case font-normal">({PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method})</span>
              </p>
              <select
                value={order.payment_status}
                disabled={saving}
                onChange={e => handleStatusChange('payment_status', e.target.value)}
                className={`text-xs font-medium px-2 py-1 rounded-full border bg-transparent focus:outline-none cursor-pointer ${TONE_CLASSES[PAYMENT_STATUS_META[order.payment_status]?.tone || 'warning']}`}
              >
                {Object.entries(PAYMENT_STATUS_META).map(([val, meta]) => (
                  <option key={val} value={val} className="bg-white text-gray-700">{meta.label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Entrega</p>
              <select
                value={order.delivery_status}
                disabled={saving}
                onChange={e => handleStatusChange('delivery_status', e.target.value)}
                className={`text-xs font-medium px-2 py-1 rounded-full border bg-transparent focus:outline-none cursor-pointer ${TONE_CLASSES[DELIVERY_STATUS_META[order.delivery_status]?.tone || 'warning']}`}
              >
                {Object.entries(DELIVERY_STATUS_META).map(([val, meta]) => (
                  <option key={val} value={val} className="bg-white text-gray-700">{meta.label}</option>
                ))}
              </select>
              {order.delivered_at && (
                <p className="text-[10px] text-gray-400 mt-1">Entregue em {formatDateTime(order.delivered_at)}</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100">
          {whatsappLink ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <WhatsappLogo size={18} weight="fill" />
              Avisar cliente no WhatsApp
            </a>
          ) : (
            <p className="text-xs text-gray-400 text-center">Sem telefone cadastrado para avisar o cliente</p>
          )}
        </div>
      </div>
    </div>
  )
}
