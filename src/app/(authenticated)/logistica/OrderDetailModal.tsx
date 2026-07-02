'use client'

import { X, MapPin, WhatsappLogo, IdentificationCard, EnvelopeSimple, Phone } from '@phosphor-icons/react'
import { buildDeliveryWhatsAppLink } from './whatsapp'

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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  boleto: 'Boleto Bancário',
  dinheiro: 'Dinheiro',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  refunded: 'Reembolsado',
}

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

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

export default function OrderDetailModal({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const address = formatAddress(order)
  const whatsappLink = buildDeliveryWhatsAppLink(order)

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
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Pagamento</p>
              <p className="text-gray-700">{PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method} · {PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Entrega</p>
              <p className="text-gray-700">
                {DELIVERY_STATUS_LABELS[order.delivery_status] || order.delivery_status}
                {order.delivered_at && ` em ${formatDateTime(order.delivered_at)}`}
              </p>
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
