'use client'

import { useState, useEffect, useRef } from 'react'
import { Package, Plus, PencilSimple, Trash, X, Check, ToggleLeft, ToggleRight } from '@phosphor-icons/react'

interface Product {
  id: string
  name: string
  description: string | null
  price: string
  status: 'active' | 'inactive'
  created_at: string
}

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface ProductFormState {
  name: string
  description: string
  price: string
  status: 'active' | 'inactive'
}

const DEFAULT_FORM: ProductFormState = { name: '', description: '', price: '', status: 'active' }

export default function ProductsSettingsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductFormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/products?include_inactive=true')
      if (res.ok) {
        const { data } = await res.json()
        setProducts(data || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProducts() }, [])

  const openCreate = () => {
    setEditingProduct(null)
    setForm(DEFAULT_FORM)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (product: Product) => {
    setEditingProduct(product)
    setForm({ name: product.name, description: product.description || '', price: Number(product.price).toFixed(2), status: product.status })
    setError(null)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    const price = parseFloat(form.price.replace(',', '.'))
    if (isNaN(price) || price < 0) { setError('Preço inválido.'); return }

    setSaving(true)
    setError(null)
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || null, price, status: form.status }
      let res: Response
      if (editingProduct) {
        res = await fetch(`/api/products/${editingProduct.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar')
      }
      await fetchProducts()
      setShowModal(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (product: Product) => {
    if (!confirm(`Excluir "${product.name}"?`)) return
    setDeletingId(product.id)
    try {
      await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
      setProducts(prev => prev.filter(p => p.id !== product.id))
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleStatus = async (product: Product) => {
    const newStatus = product.status === 'active' ? 'inactive' : 'active'
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: newStatus } : p))
    try {
      await fetch(`/api/products/${product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })
    } catch {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: product.status } : p))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Produtos</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gerencie o catálogo de produtos para pedidos</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Novo produto
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">Carregando...</div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 bg-white rounded-2xl border border-gray-100">
            <Package size={40} className="text-gray-300" />
            <p className="text-gray-400">Nenhum produto cadastrado</p>
            <button onClick={openCreate} className="text-sm text-blue-600 hover:underline">Criar primeiro produto</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Preço</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map(product => (
                  <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900 text-sm">{product.name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-gray-500 max-w-xs truncate">{product.description || '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(product.price)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleToggleStatus(product)}
                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${product.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                      >
                        {product.status === 'active' ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        {product.status === 'active' ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEdit(product)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <PencilSimple size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          disabled={deletingId === product.id}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {editingProduct ? 'Editar produto' : 'Novo produto'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Bellas Emagry Premium"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Descrição opcional..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                  placeholder="0,00"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <div className="flex gap-2">
                  {(['active', 'inactive'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setForm(p => ({ ...p, status: s }))}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${form.status === s ? (s === 'active' ? 'bg-green-600 text-white' : 'bg-gray-600 text-white') : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {s === 'active' ? 'Ativo' : 'Inativo'}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
