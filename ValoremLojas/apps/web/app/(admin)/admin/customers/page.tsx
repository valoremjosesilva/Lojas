'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../../lib/api'

interface Customer {
  id: string
  name: string
  email: string
  phone?: string | null
  cpf?: string | null
  createdAt: string
  _count?: { orders: number }
}

interface OrderItem {
  name: string
  quantity: number
  price: string | number
}

interface CustomerOrder {
  id: string
  status: string
  total: string | number
  createdAt: string
  payment?: { status: string; method: string } | null
  items: OrderItem[]
}

interface CustomerDetail extends Customer {
  addresses: Array<{
    id: string
    label?: string | null
    street: string
    number: string
    district: string
    city: string
    state: string
    zipCode: string
  }>
  orders: CustomerOrder[]
  stats: { orderCount: number; totalSpent: number }
}

interface CustomerForm {
  name: string
  email: string
  phone: string
  cpf: string
}

const EMPTY_FORM: CustomerForm = { name: '', email: '', phone: '', cpf: '' }

const brl = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_STYLE: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700',
  DELIVERED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  AWAITING_PAYMENT: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  SHIPPED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-red-100 text-red-700',
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<CustomerForm>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (!token) { window.location.href = '/admin/login'; return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function load() {
    const token = localStorage.getItem('admin_token') ?? ''
    setLoading(true)
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    qs.set('page', String(page))
    api.get<any>(`/customers?${qs.toString()}`, { token })
      .then((res) => setCustomers(Array.isArray(res) ? res : []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    if (page !== 1) setPage(1)
    else load()
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM })
    setEditId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(c: Customer) {
    setForm({ name: c.name, email: c.email, phone: c.phone ?? '', cpf: c.cpf ?? '' })
    setEditId(c.id)
    setError('')
    setShowForm(true)
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Nome e e-mail são obrigatórios.')
      return
    }
    const token = localStorage.getItem('admin_token') ?? ''
    setSaving(true)
    setError('')
    const body = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      cpf: form.cpf.trim() || undefined,
    }
    try {
      if (editId) await api.put(`/customers/${editId}`, body, { token })
      else await api.post('/customers', body, { token })
      setShowForm(false)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: Customer) {
    if (!confirm(`Excluir cliente "${c.name}"?`)) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.delete(`/customers/${c.id}`, { token })
      if (detail?.id === c.id) setDetail(null)
      load()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function openDetail(id: string) {
    const token = localStorage.getItem('admin_token') ?? ''
    setDetailLoading(true)
    setDetail(null)
    try {
      const data = await api.get<CustomerDetail>(`/customers/${id}`, { token })
      setDetail(data)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <button onClick={openCreate}
          className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition">
          + Novo cliente
        </button>
      </div>

      {/* Busca */}
      <form onSubmit={submitSearch} className="flex gap-2 mb-5">
        <input
          className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-md focus:outline-none focus:ring-2 focus:ring-black"
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
          Buscar
        </button>
      </form>

      {/* Formulário */}
      {showForm && (
        <div className="bg-white border rounded-xl p-6 mb-6">
          <h2 className="font-semibold mb-4">{editId ? 'Editar cliente' : 'Novo cliente'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nome *</label>
              <input
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">E-mail *</label>
              <input
                type="email"
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Telefone</label>
              <input
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="(11) 99999-9999"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">CPF</label>
              <input
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          <div className="flex gap-3 mt-5">
            <button onClick={save} disabled={saving}
              className="bg-black text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-5 py-2 rounded-lg text-sm border hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b font-semibold text-sm">
          {loading ? 'Carregando...' : `${customers.length} cliente${customers.length !== 1 ? 's' : ''}`}
        </div>
        {loading ? (
          <p className="p-6 text-gray-400 text-sm">Carregando clientes...</p>
        ) : customers.length === 0 ? (
          <p className="p-6 text-gray-400 text-sm">Nenhum cliente encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Nome', 'E-mail', 'Telefone', 'Pedidos', 'Cadastro', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <button onClick={() => openDetail(c.id)} className="hover:underline text-left">
                      {c.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email}</td>
                  <td className="px-4 py-3 text-gray-500">{c.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs font-medium">
                      {c._count?.orders ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => openDetail(c.id)} className="text-gray-700 hover:underline text-xs mr-3">Ver</button>
                    <button onClick={() => openEdit(c)} className="text-blue-600 hover:underline text-xs mr-3">Editar</button>
                    <button onClick={() => remove(c)} className="text-red-500 hover:underline text-xs">Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação simples */}
      {!loading && (customers.length === 20 || page > 1) && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="border px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">
            ← Anterior
          </button>
          <span className="text-sm text-gray-500">Página {page}</span>
          <button
            disabled={customers.length < 20}
            onClick={() => setPage((p) => p + 1)}
            className="border px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">
            Próxima →
          </button>
        </div>
      )}

      {/* Drawer de detalhe + histórico de pedidos */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={() => setDetail(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            {detailLoading || !detail ? (
              <p className="text-gray-400 text-sm">Carregando...</p>
            ) : (
              <>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">{detail.name}</h2>
                    <p className="text-sm text-gray-500">{detail.email}</p>
                    {detail.phone && <p className="text-sm text-gray-500">{detail.phone}</p>}
                    {detail.cpf && <p className="text-xs text-gray-400 mt-1">CPF: {detail.cpf}</p>}
                  </div>
                  <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold">{detail.stats.orderCount}</p>
                    <p className="text-xs text-gray-500">Pedidos no total</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-green-600">{brl(detail.stats.totalSpent)}</p>
                    <p className="text-xs text-gray-500">Total gasto (pago)</p>
                  </div>
                </div>

                {/* Endereços */}
                {detail.addresses.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Endereços</h3>
                    <div className="space-y-2">
                      {detail.addresses.map((a) => (
                        <div key={a.id} className="border rounded-lg p-3 text-sm">
                          {a.label && <span className="text-xs font-medium text-gray-500">{a.label}</span>}
                          <p>{a.street}, {a.number} — {a.district}</p>
                          <p className="text-gray-500">{a.city}/{a.state} · {a.zipCode}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Histórico de pedidos */}
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Histórico de pedidos</h3>
                {detail.orders.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum pedido ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {detail.orders.map((o) => (
                      <div key={o.id} className="border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs text-gray-400">#{o.id.slice(0, 8).toUpperCase()}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[o.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {o.status}
                          </span>
                        </div>
                        <ul className="text-sm text-gray-600 mb-2">
                          {o.items.map((it, i) => (
                            <li key={i} className="flex justify-between">
                              <span>{it.quantity}× {it.name}</span>
                              <span className="text-gray-400">{brl(it.price)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-center justify-between text-sm border-t pt-2">
                          <span className="text-gray-400">{new Date(o.createdAt).toLocaleString('pt-BR')}</span>
                          <span className="font-semibold">{brl(o.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
