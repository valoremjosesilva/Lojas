'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '../../../../lib/api'

interface ProductImage {
  id: string
  url: string
  alt?: string | null
  order: number
}

interface Product {
  id: string
  name: string
  slug: string
  price: string | number
  comparePrice?: string | number | null
  stock: number
  sku?: string | null
  active: boolean
  featured: boolean
  category?: { name: string } | null
  images?: ProductImage[]
}

interface Category {
  id: string
  name: string
  slug: string
}

interface AttributeValue {
  id: string
  value: string
  position: number
}

interface ProductAttribute {
  id: string
  name: string
  position: number
  values: AttributeValue[]
}

interface VariantAttributeValue {
  attributeValueId: string
  attributeValue: { id: string; value: string; attributeId: string; attribute: { id: string; name: string } }
}

interface ProductVariant {
  id: string
  sku?: string | null
  price: string | number
  comparePrice?: string | number | null
  stock: number
  active: boolean
  attributeValues: VariantAttributeValue[]
  images?: ProductImage[]
}

interface ProductForm {
  name: string
  slug: string
  description: string
  price: string
  comparePrice: string
  stock: string
  sku: string
  categoryId: string
  active: boolean
  featured: boolean
}

const EMPTY_FORM: ProductForm = {
  name: '', slug: '', description: '', price: '', comparePrice: '',
  stock: '0', sku: '', categoryId: '', active: true, featured: false,
}

function slugify(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const brl = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editSlug, setEditSlug] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductForm>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Image manager
  const [imagesProduct, setImagesProduct] = useState<Product | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Variants tab
  const [variantTab, setVariantTab] = useState<'info' | 'variants'>('info')
  const [attributes, setAttributes] = useState<ProductAttribute[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [newAttrName, setNewAttrName] = useState('')
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({})
  const [variantEdits, setVariantEdits] = useState<Record<string, Partial<ProductVariant>>>({})
  const [savingVariant, setSavingVariant] = useState<string | null>(null)
  const [variantsReloadCount, setVariantsReloadCount] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (!token) { window.location.href = '/admin/login'; return }
    load(token)
  }, [])

  function load(token?: string) {
    const t = token ?? localStorage.getItem('admin_token') ?? ''
    setLoading(true)
    Promise.all([
      api.get<any>('/products', { token: t }),
      api.get<any>('/categories?flat=true', { token: t }),
    ])
      .then(([prods, cats]) => {
        setProducts(Array.isArray(prods) ? prods : (prods.data ?? []))
        setCategories(Array.isArray(cats) ? cats : [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function loadVariantsData(productId: string) {
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      const [attrs, vars] = await Promise.all([
        api.get<ProductAttribute[]>(`/products/${productId}/attributes`, { token }),
        api.get<ProductVariant[]>(`/products/${productId}/variants`, { token }),
      ])
      setAttributes(Array.isArray(attrs) ? attrs : [])
      setVariants(Array.isArray(vars) ? vars : [])
      setVariantsReloadCount((n) => n + 1)
    } catch { /* ignore */ }
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM })
    setEditSlug(null)
    setEditId(null)
    setError('')
    setShowForm(true)
    setVariantTab('info')
    setAttributes([])
    setVariants([])
    setNewAttrName('')
    setNewValueInputs({})
    setVariantEdits({})
    setSavingVariant(null)
    setVariantsReloadCount(0)
  }

  function openEdit(p: Product) {
    setForm({
      name: p.name,
      slug: p.slug,
      description: '',
      price: String(p.price),
      comparePrice: p.comparePrice ? String(p.comparePrice) : '',
      stock: String(p.stock),
      sku: p.sku ?? '',
      categoryId: p.category ? (categories.find((c) => c.name === p.category!.name)?.id ?? '') : '',
      active: p.active,
      featured: p.featured,
    })
    setEditSlug(p.slug)
    setEditId(p.id)
    setError('')
    setShowForm(true)
    setVariantTab('info')
    loadVariantsData(p.id)
  }

  async function save() {
    if (!form.name || !form.slug || !form.price) { setError('Preencha nome, slug e preço.'); return }
    const token = localStorage.getItem('admin_token') ?? ''
    setSaving(true)
    setError('')
    const body = {
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      price: Number(form.price),
      comparePrice: form.comparePrice ? Number(form.comparePrice) : undefined,
      stock: Number(form.stock),
      sku: form.sku || undefined,
      categoryId: form.categoryId || undefined,
      active: form.active,
      featured: form.featured,
    }
    try {
      if (editSlug) {
        await api.put(`/products/${editSlug}`, body, { token })
      } else {
        await api.post('/products', body, { token })
      }
      setShowForm(false)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(slug: string, name: string) {
    if (!confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.delete(`/products/${slug}`, { token })
      load()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function toggleActive(p: Product) {
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.put(`/products/${p.slug}`, { active: !p.active }, { token })
      load()
    } catch (e: any) {
      alert(e.message)
    }
  }

  // ─── Attributes ───────────────────────────────────────────────────────────
  async function addAttribute() {
    if (!newAttrName.trim() || !editId) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.post(`/products/${editId}/attributes`, { name: newAttrName.trim() }, { token })
      setNewAttrName('')
      await loadVariantsData(editId)
    } catch (e: any) { alert(e.message) }
  }

  async function deleteAttribute(attrId: string) {
    if (!editId || !confirm('Remover atributo e todos os seus valores?')) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.delete(`/products/${editId}/attributes/${attrId}`, { token })
      await loadVariantsData(editId)
    } catch (e: any) { alert(e.message) }
  }

  async function addValue(attrId: string) {
    const val = newValueInputs[attrId]?.trim()
    if (!val || !editId) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.post(`/products/${editId}/attributes/${attrId}/values`, { value: val }, { token })
      setNewValueInputs((prev) => ({ ...prev, [attrId]: '' }))
      await loadVariantsData(editId)
    } catch (e: any) { alert(e.message) }
  }

  async function deleteValue(attrId: string, valueId: string) {
    if (!editId) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.delete(`/products/${editId}/attributes/${attrId}/values/${valueId}`, { token })
      await loadVariantsData(editId)
    } catch (e: any) { alert(e.message) }
  }

  // ─── Variants ─────────────────────────────────────────────────────────────
  async function generateVariants() {
    if (!editId || !confirm('Gerar todas as combinações? Variantes existentes não serão duplicadas.')) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.post(`/products/${editId}/variants/generate`, {}, { token })
      await loadVariantsData(editId)
    } catch (e: any) { alert(e.message) }
  }

  async function saveVariantEdit(variantId: string) {
    if (!editId) return
    const token = localStorage.getItem('admin_token') ?? ''
    setSavingVariant(variantId)
    try {
      await api.patch(`/products/${editId}/variants/${variantId}`, variantEdits[variantId] ?? {}, { token })
      setVariantEdits((prev) => { const n = { ...prev }; delete n[variantId]; return n })
      await loadVariantsData(editId)
    } catch (e: any) { alert(e.message) }
    finally { setSavingVariant(null) }
  }

  async function toggleVariantActive(v: ProductVariant) {
    if (!editId) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.patch(`/products/${editId}/variants/${v.id}`, { active: !v.active }, { token })
      await loadVariantsData(editId)
    } catch (e: any) { alert(e.message) }
  }

  // --- Image management ---
  async function openImages(p: Product) {
    const token = localStorage.getItem('admin_token') ?? ''
    setImagesProduct(p)
    try {
      const imgs = await api.get<ProductImage[]>(`/products/${p.id}/images`, { token })
      setImages(Array.isArray(imgs) ? imgs : [])
    } catch {
      setImages(p.images ?? [])
    }
  }

  async function uploadImage(file: File) {
    if (!imagesProduct) return
    const token = localStorage.getItem('admin_token') ?? ''
    setUploading(true)
    try {
      // 1. Get presigned URL
      const { uploadUrl, publicUrl } = await api.post<{ uploadUrl: string; key: string; publicUrl: string }>(
        '/media/upload-url',
        { fileName: file.name, contentType: file.type, folder: 'products' },
        { token },
      )
      // 2. Upload directly to S3/R2
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      // 3. Register image on the product
      await api.post(`/products/${imagesProduct.id}/images`, { url: publicUrl }, { token })
      // 4. Refresh image list
      const imgs = await api.get<ProductImage[]>(`/products/${imagesProduct.id}/images`, { token })
      setImages(Array.isArray(imgs) ? imgs : [])
      load()
    } catch (e: any) {
      alert(`Erro no upload: ${e.message}`)
    } finally {
      setUploading(false)
    }
  }

  async function deleteImage(imageId: string) {
    if (!imagesProduct) return
    if (!confirm('Remover esta imagem?')) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.delete(`/products/${imagesProduct.id}/images/${imageId}`, { token })
      setImages((prev) => prev.filter((i) => i.id !== imageId))
      load()
    } catch (e: any) {
      alert(e.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Produtos</h1>
        <button onClick={openCreate}
          className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition">
          + Novo produto
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-white border rounded-xl p-6 mb-6">
          <h2 className="font-semibold mb-4">{editSlug ? 'Editar produto' : 'Novo produto'}</h2>

          {/* Tabs — apenas na edição */}
          {editId && (
            <div className="flex gap-1 mb-5 border-b">
              {(['info', 'variants'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setVariantTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition
                    ${variantTab === t ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  {t === 'info' ? 'Informações' : 'Variantes'}
                </button>
              ))}
            </div>
          )}

          {(!editId || variantTab === 'info') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nome *</label>
              <input className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Ex: Camiseta Polo"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Slug *</label>
              <input className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="camiseta-polo"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Preço (R$) *</label>
              <input type="number" step="0.01" min="0"
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="99.90"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Preço "de" (opcional)</label>
              <input type="number" step="0.01" min="0"
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="129.90"
                value={form.comparePrice}
                onChange={(e) => setForm({ ...form, comparePrice: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Estoque *</label>
              <input type="number" min="0"
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">SKU</label>
              <input className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="SKU-001"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Categoria</label>
              <select className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">— Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Descrição</label>
              <textarea rows={3}
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
                placeholder="Descrição do produto..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Ativo
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
                Destaque na home
              </label>
            </div>
          </div>
          )}

          {/* Aba Variantes */}
          {editId && variantTab === 'variants' && (
            <div className="space-y-6">

              {/* Seção Atributos */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Atributos</h3>
                {attributes.length === 0 && (
                  <p className="text-sm text-gray-400 mb-3">Nenhum atributo cadastrado.</p>
                )}
                <div className="space-y-3">
                  {attributes.map((attr) => (
                    <div key={attr.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{attr.name}</span>
                        <button onClick={() => deleteAttribute(attr.id)}
                          className="text-xs text-red-400 hover:text-red-600">Remover</button>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {attr.values.map((v) => (
                          <span key={v.id}
                            className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                            {v.value}
                            <button onClick={() => deleteValue(attr.id, v.id)}
                              className="text-gray-400 hover:text-red-500 leading-none">&times;</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          className="border rounded px-2 py-1 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-black"
                          placeholder="+ novo valor"
                          value={newValueInputs[attr.id] ?? ''}
                          onChange={(e) => setNewValueInputs((prev) => ({ ...prev, [attr.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && addValue(attr.id)}
                        />
                        <button onClick={() => addValue(attr.id)}
                          className="text-xs border px-2 py-1 rounded hover:bg-gray-50">Adicionar</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <input
                    className="border rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Nome do atributo (ex: Tamanho)"
                    value={newAttrName}
                    onChange={(e) => setNewAttrName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addAttribute()}
                  />
                  <button onClick={addAttribute}
                    className="bg-black text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800">
                    + Atributo
                  </button>
                </div>
              </div>

              {/* Gerar combinações */}
              {attributes.length > 0 && (
                <div>
                  <button onClick={generateVariants}
                    className="border border-dashed border-gray-400 text-gray-600 px-4 py-2 rounded-lg text-sm hover:border-black hover:text-black transition">
                    Gerar todas as combinações
                  </button>
                  <p className="text-xs text-gray-400 mt-1">Variantes existentes não serão duplicadas.</p>
                </div>
              )}

              {/* Tabela de variantes */}
              {variants.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Variantes ({variants.length})
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Atributos', 'SKU', 'Preço', 'Estoque', 'Ativo', ''].map((h, i) => (
                            <th key={i} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {variants.map((v) => {
                          const label = v.attributeValues
                            .map((vav) => vav.attributeValue.value)
                            .join(' / ')
                          return (
                            <tr key={`${v.id}-${variantsReloadCount}`} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium">{label || '—'}</td>
                              <td className="px-3 py-2">
                                <input
                                  className="border rounded px-2 py-1 w-24 text-xs focus:outline-none focus:ring-1 focus:ring-black"
                                  placeholder="SKU"
                                  defaultValue={v.sku ?? ''}
                                  onChange={(e) =>
                                    setVariantEdits((prev) => ({
                                      ...prev,
                                      [v.id]: { ...(prev[v.id] ?? {}), sku: e.target.value },
                                    }))
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number" step="0.01" min="0"
                                  className="border rounded px-2 py-1 w-24 text-xs focus:outline-none focus:ring-1 focus:ring-black"
                                  defaultValue={Number(v.price)}
                                  onChange={(e) =>
                                    setVariantEdits((prev) => ({
                                      ...prev,
                                      [v.id]: { ...(prev[v.id] ?? {}), price: Number(e.target.value) },
                                    }))
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number" min="0"
                                  className="border rounded px-2 py-1 w-20 text-xs focus:outline-none focus:ring-1 focus:ring-black"
                                  defaultValue={v.stock}
                                  onChange={(e) =>
                                    setVariantEdits((prev) => ({
                                      ...prev,
                                      [v.id]: { ...(prev[v.id] ?? {}), stock: Number(e.target.value) },
                                    }))
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => toggleVariantActive(v)}
                                  className={`px-2 py-1 rounded-full text-xs font-medium transition
                                    ${v.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                                >
                                  {v.active ? 'Ativo' : 'Inativo'}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                {variantEdits[v.id] && (
                                  <button
                                    onClick={() => saveVariantEdit(v.id)}
                                    disabled={savingVariant === v.id}
                                    className="text-xs bg-black text-white px-2 py-1 rounded hover:bg-gray-800 disabled:opacity-50"
                                  >
                                    {savingVariant === v.id ? '...' : 'Salvar'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          <div className="flex gap-3 mt-5">
            <button onClick={save} disabled={saving}
              className="bg-black text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800">
              {saving ? 'Salvando...' : 'Salvar produto'}
            </button>
            {editId && (
              <button onClick={() => { setShowForm(false); openImages({ id: editId, name: form.name, slug: editSlug!, price: form.price, stock: Number(form.stock), active: form.active, featured: form.featured }) }}
                className="px-5 py-2 rounded-lg text-sm border border-blue-300 text-blue-600 hover:bg-blue-50">
                Gerenciar imagens
              </button>
            )}
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
          {loading ? 'Carregando...' : `${products.length} produto${products.length !== 1 ? 's' : ''}`}
        </div>
        {loading ? (
          <p className="p-6 text-gray-400 text-sm">Carregando produtos...</p>
        ) : products.length === 0 ? (
          <p className="p-6 text-gray-400 text-sm">Nenhum produto cadastrado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Produto', 'Preço', 'Estoque', 'SKU', 'Status', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.images && p.images[0] ? (
                        <img src={p.images[0].url} alt={p.name}
                          className="w-10 h-10 object-cover rounded-lg border flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg border bg-gray-100 flex items-center justify-center text-gray-300 text-lg flex-shrink-0">
                          &#128247;
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{p.slug}</div>
                        {p.featured && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded mt-0.5 inline-block">destaque</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{brl(p.price)}</div>
                    {p.comparePrice && (
                      <div className="text-xs text-gray-400 line-through">{brl(p.comparePrice)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={p.stock === 0 ? 'text-red-500 font-medium' : ''}>{p.stock}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.sku || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(p)}
                      className={`px-2 py-1 rounded-full text-xs font-medium transition
                        ${p.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {p.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-xs mr-3">Editar</button>
                    <button onClick={() => openImages(p)} className="text-gray-600 hover:underline text-xs mr-3">Imagens</button>
                    <button onClick={() => remove(p.slug, p.name)} className="text-red-500 hover:underline text-xs">Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de imagens */}
      {imagesProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold">Imagens</h2>
                <p className="text-sm text-gray-500">{imagesProduct.name}</p>
              </div>
              <button onClick={() => setImagesProduct(null)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {/* Grid de imagens */}
              {images.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Nenhuma imagem cadastrada.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {images.map((img, i) => (
                    <div key={img.id} className="relative group rounded-lg overflow-hidden border aspect-square">
                      <img src={img.url} alt={img.alt ?? ''} className="w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                          Principal
                        </span>
                      )}
                      <button
                        onClick={() => deleteImage(img.id)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 text-xs items-center justify-center hidden group-hover:flex">
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload */}
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition
                  ${uploading ? 'border-gray-300 opacity-50 pointer-events-none' : 'border-gray-300 hover:border-black hover:bg-gray-50'}`}>
                <div className="text-3xl text-gray-300 mb-2">+</div>
                <p className="text-sm text-gray-500">
                  {uploading ? 'Enviando imagem...' : 'Clique para adicionar imagem'}
                </p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP — máx. 10 MB</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadImage(file)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
