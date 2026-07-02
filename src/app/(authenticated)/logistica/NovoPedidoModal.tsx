'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Minus, MapPin, Check, Calendar } from '@phosphor-icons/react'

interface Product {
  id: string
  name: string
  price: string
  description?: string
}

interface OrderItem {
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
}

interface NovoPedidoModalProps {
  onClose: () => void
  onSuccess?: () => void
}

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'dinheiro', label: 'Dinheiro' },
]

const PAYMENT_STATUS = [
  { value: 'pending', label: 'Pendente' },
  { value: 'paid', label: 'Pago' },
]

const DELIVERY_STATUS = [
  { value: 'pending', label: 'Pendente' },
  { value: 'shipped', label: 'Enviado' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'cancelled', label: 'Cancelado' },
]

function maskCpf(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskCep(v: string) {
  return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
}

function nowDatetimeLocal() {
  const d = new Date()
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
}

export default function NovoPedidoModal({ onClose, onSuccess }: NovoPedidoModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<OrderItem[]>([{ product_id: null, product_name: '', quantity: 1, unit_price: 0 }])
  const [selectedMethods, setSelectedMethods] = useState<string[]>(['pix'])
  const [paymentStatus, setPaymentStatus] = useState('pending')
  const [deliveryStatus, setDeliveryStatus] = useState('pending')
  const [orderDate, setOrderDate] = useState(nowDatetimeLocal())
  const [notes, setNotes] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [cep, setCep] = useState('')
  const [address, setAddress] = useState('')
  const [addressNumber, setAddressNumber] = useState('')
  const [addressComplement, setAddressComplement] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState<Record<number, string>>({})
  const [showProductDropdown, setShowProductDropdown] = useState<Record<number, boolean>>({})

  useEffect(() => {
    fetch('/api/products?include_inactive=false')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(({ data }) => setProducts(data || []))
      .catch(() => {})
  }, [])

  const handleCepBlur = async () => {
    const cleanCep = cep.replace(/\D/g, '')
    if (cleanCep.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setAddress(data.logradouro || '')
        setNeighborhood(data.bairro || '')
        setCity(data.localidade || '')
        setState(data.uf || '')
      }
    } catch {}
    setCepLoading(false)
  }

  const toggleMethod = (value: string) => {
    setSelectedMethods(prev => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev
        return prev.filter(m => m !== value)
      }
      if (prev.length >= 2) return [prev[1], value]
      return [...prev, value]
    })
  }

  const totalValue = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  const handleItemProductSelect = (idx: number, product: Product) => {
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item, product_id: product.id, product_name: product.name, unit_price: Number(product.price),
    } : item))
    setProductSearch(prev => ({ ...prev, [idx]: product.name }))
    setShowProductDropdown(prev => ({ ...prev, [idx]: false }))
  }

  const handleSubmit = async () => {
    if (items.some(item => !item.product_name.trim())) {
      setError('Preencha o nome do produto em todos os itens.'); return
    }
    setSaving(true); setError(null)
    try {
      const primaryMethod = selectedMethods[0]
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: null,
          payment_method: primaryMethod,
          payment_status: paymentStatus,
          delivery_status: deliveryStatus,
          order_date: orderDate ? new Date(orderDate).toISOString() : undefined,
          total_value: totalValue,
          notes: selectedMethods.length > 1 ? `Pagamento: ${selectedMethods.map(m => PAYMENT_METHODS.find(p => p.value === m)?.label).join(' + ')}${notes ? '\n' + notes : ''}` : (notes || null),
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          customer_email: customerEmail || null,
          customer_cpf: cpf.replace(/\D/g, '') || null,
          customer_cep: cep.replace(/\D/g, '') || null,
          customer_address: address || null,
          customer_address_number: addressNumber || null,
          customer_address_complement: addressComplement || null,
          customer_neighborhood: neighborhood || null,
          customer_city: city || null,
          customer_state: state || null,
          items: items.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao salvar pedido') }
      onSuccess?.()
      onClose()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white border border-gray-100 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Novo pedido</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Data e hora do pedido */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-1.5">
              <Calendar size={12} /> Data e hora do pedido
            </label>
            <input
              type="datetime-local"
              value={orderDate}
              onChange={e => setOrderDate(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          {/* Produtos */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Produtos</p>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const filtered = products.filter(p => p.name.toLowerCase().includes((productSearch[idx] || '').toLowerCase()))
                return (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="Nome do produto..."
                        value={productSearch[idx] !== undefined ? productSearch[idx] : item.product_name}
                        onChange={e => {
                          setProductSearch(prev => ({ ...prev, [idx]: e.target.value }))
                          setItems(prev => prev.map((it, i) => i === idx ? { ...it, product_name: e.target.value, product_id: null } : it))
                          setShowProductDropdown(prev => ({ ...prev, [idx]: true }))
                        }}
                        onFocus={() => setShowProductDropdown(prev => ({ ...prev, [idx]: true }))}
                        onBlur={() => setTimeout(() => setShowProductDropdown(prev => ({ ...prev, [idx]: false })), 150)}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                      {showProductDropdown[idx] && filtered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                          {filtered.map(p => (
                            <button key={p.id} onMouseDown={() => handleItemProductSelect(idx, p)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                              <span>{p.name}</span>
                              <span className="text-blue-600 text-xs">R$ {Number(p.price).toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it))} className="w-7 h-7 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800">
                        <Minus size={12} />
                      </button>
                      <span className="w-8 text-center text-sm text-gray-900">{item.quantity}</span>
                      <button onClick={() => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: it.quantity + 1 } : it))} className="w-7 h-7 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800">
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="w-28 flex-shrink-0">
                      <input type="number" step="0.01" min="0" value={item.unit_price || ''} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: Number(e.target.value) } : it))} placeholder="R$ 0,00" className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    {items.length > 1 && (
                      <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 flex-shrink-0 mt-0.5"><X size={16} /></button>
                    )}
                  </div>
                )
              })}
            </div>
            <button onClick={() => setItems(prev => [...prev, { product_id: null, product_name: '', quantity: 1, unit_price: 0 }])} className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
              <Plus size={14} /> Adicionar produto
            </button>
          </div>

          {/* Pagamento e entrega */}
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                Forma de Pagamento <span className="text-gray-400 normal-case font-normal">(selecione até 2)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map(m => {
                  const selected = selectedMethods.includes(m.value)
                  return (
                    <button
                      key={m.value}
                      onClick={() => toggleMethod(m.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        selected ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {selected && <Check size={10} weight="bold" />}
                      {m.label}
                    </button>
                  )
                })}
              </div>
              {selectedMethods.length === 2 && (
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Pagamento dividido: {selectedMethods.map(m => PAYMENT_METHODS.find(p => p.value === m)?.label).join(' + ')}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Status do Pagamento</p>
                <div className="flex gap-2">
                  {PAYMENT_STATUS.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setPaymentStatus(s.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        paymentStatus === s.value ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {paymentStatus === s.value && <Check size={10} weight="bold" className="inline mr-1" />}
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Status de Entrega</p>
                <select
                  value={deliveryStatus}
                  onChange={e => setDeliveryStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  {DELIVERY_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Dados do cliente */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Dados do Cliente</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 font-medium">Nome</label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-medium">Telefone</label>
                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-medium">E-mail</label>
                <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-medium">CPF</label>
                <input value={cpf} onChange={e => setCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
              <MapPin size={12} /> Endereço de Entrega
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 font-medium">CEP</label>
                <input value={cep} onChange={e => setCep(maskCep(e.target.value))} onBlur={handleCepBlur} placeholder="00000-000" className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                {cepLoading && <span className="text-[10px] text-blue-600">Buscando...</span>}
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-gray-400 font-medium">Endereço</label>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, Av..." className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-medium">Número</label>
                <input value={addressNumber} onChange={e => setAddressNumber(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-gray-400 font-medium">Complemento</label>
                <input value={addressComplement} onChange={e => setAddressComplement(e.target.value)} placeholder="Apto, Bloco..." className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-medium">Bairro</label>
                <input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-medium">Cidade</label>
                <input value={city} onChange={e => setCity(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-medium">Estado</label>
                <input value={state} onChange={e => setState(e.target.value)} maxLength={2} placeholder="SP" className="w-full mt-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas internas..." className="w-full mt-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder-gray-400 resize-none" />
          </div>

          {error && <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xl font-bold text-gray-900">
            R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">Cancelar</button>
            <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait transition-colors">
              {saving ? 'Salvando...' : 'Salvar pedido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
