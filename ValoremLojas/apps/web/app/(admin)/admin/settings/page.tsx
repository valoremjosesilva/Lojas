'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../../lib/api'

interface StoreForm {
  name: string
  description: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
  allowGuestCheckout: boolean
  currency: string
  maxInstallments: number
  minOrderValue: string
  freeShippingFrom: string
}

interface BillingStatus {
  plan: string
  effectivePlan: string
  trial: {
    active: boolean
    plan: string | null
    endsAt: string | null
    daysRemaining: number | null
  }
  pendingRequest: { id: string; toPlan: string; createdAt: string } | null
  billingEmail: string | null
}

const EMPTY: StoreForm = {
  name: '',
  description: '',
  logoUrl: '',
  primaryColor: '#000000',
  secondaryColor: '#ffffff',
  allowGuestCheckout: true,
  currency: 'BRL',
  maxInstallments: 12,
  minOrderValue: '0',
  freeShippingFrom: '',
}

const PLAN_LABEL: Record<string, string> = {
  BASIC: 'Basic',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
}

const UPGRADEABLE_TO: Record<string, string[]> = {
  BASIC: ['PRO', 'ENTERPRISE'],
  PRO: ['ENTERPRISE'],
  ENTERPRISE: [],
}

export default function AdminSettings() {
  const [form, setForm] = useState<StoreForm>({ ...EMPTY })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null)
  const [requestingUpgrade, setRequestingUpgrade] = useState(false)
  const [upgradeSuccess, setUpgradeSuccess] = useState(false)
  const [upgradeError, setUpgradeError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (!token) { window.location.href = '/admin/login'; return }

    Promise.all([
      api.get<any>('/store', { token }),
      api.get<BillingStatus>('/billing/status', { token }).catch(() => null),
    ]).then(([store, billingData]) => {
      const s = store.storeSettings ?? {}
      setForm({
        name: store.name ?? '',
        description: store.description ?? '',
        logoUrl: store.logoUrl ?? '',
        primaryColor: store.primaryColor ?? '#000000',
        secondaryColor: store.secondaryColor ?? '#ffffff',
        allowGuestCheckout: s.allowGuestCheckout ?? true,
        currency: s.currency ?? 'BRL',
        maxInstallments: s.maxInstallments ?? 12,
        minOrderValue: s.minOrderValue != null ? String(s.minOrderValue) : '0',
        freeShippingFrom: s.freeShippingFrom != null ? String(s.freeShippingFrom) : '',
      })
      setBilling(billingData)
    })
    .catch(console.error)
    .finally(() => setLoading(false))
  }, [])

  async function save() {
    const token = localStorage.getItem('admin_token') ?? ''
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      await api.put('/store', {
        name: form.name,
        description: form.description || undefined,
        logoUrl: form.logoUrl || undefined,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        storeSettings: {
          allowGuestCheckout: form.allowGuestCheckout,
          currency: form.currency,
          maxInstallments: Number(form.maxInstallments),
          minOrderValue: Number(form.minOrderValue),
          freeShippingFrom: form.freeShippingFrom ? Number(form.freeShippingFrom) : null,
        },
      }, { token })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function confirmUpgrade() {
    if (!upgradeTarget) return
    const token = localStorage.getItem('admin_token') ?? ''
    setRequestingUpgrade(true)
    setUpgradeError('')
    try {
      const newRequest = await api.post('/billing/upgrade', { toPlan: upgradeTarget }, { token })
      setUpgradeSuccess(true)
      setUpgradeTarget(null)
      setBilling((prev) =>
        prev
          ? {
              ...prev,
              pendingRequest: {
                id: newRequest.id,
                toPlan: upgradeTarget,
                createdAt: newRequest.createdAt,
              },
            }
          : prev,
      )
    } catch (e: any) {
      setUpgradeError(e.message)
    } finally {
      setRequestingUpgrade(false)
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Configurações</h1>
        <p className="text-gray-400 text-sm">Carregando...</p>
      </div>
    )
  }

  const upgradableTargets = billing ? (UPGRADEABLE_TO[billing.effectivePlan] ?? []) : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <button onClick={save} disabled={saving}
          className="bg-black text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition">
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-4 mb-5 text-sm">
          Configurações salvas com sucesso.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-4 mb-5 text-sm">
          {error}
        </div>
      )}

      {/* Seção de plano */}
      {billing && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="font-semibold mb-4">Plano atual</h2>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="bg-gray-100 text-gray-800 text-sm font-semibold px-3 py-1 rounded-full uppercase">
              {PLAN_LABEL[billing.plan] ?? billing.plan}
            </span>
            {billing.trial.active && (
              <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded-full uppercase">
                EM TRIAL
              </span>
            )}
          </div>

          {billing.trial.active && billing.trial.plan && (
            <p className="text-sm text-yellow-700 mb-3">
              Usando o plano <strong>{PLAN_LABEL[billing.trial.plan] ?? billing.trial.plan}</strong> em trial.
              {billing.trial.daysRemaining !== null && (
                <> Expira em <strong>{billing.trial.daysRemaining} dia{billing.trial.daysRemaining !== 1 ? 's' : ''}</strong>.</>
              )}
            </p>
          )}

          {upgradeSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-3 text-sm">
              Solicitação de upgrade enviada com sucesso. Entraremos em contato em breve.
            </div>
          )}

          {billing.pendingRequest ? (
            <p className="text-sm text-blue-700 font-medium">
              Upgrade para <strong>{PLAN_LABEL[billing.pendingRequest.toPlan] ?? billing.pendingRequest.toPlan}</strong> solicitado — aguardando aprovação.
            </p>
          ) : billing.effectivePlan === 'ENTERPRISE' ? (
            <p className="text-sm text-gray-500">Você está no plano máximo.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mt-2">
              {upgradableTargets.map((target) => (
                <button
                  key={target}
                  onClick={() => { setUpgradeTarget(target); setUpgradeError('') }}
                  className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition">
                  Solicitar {PLAN_LABEL[target] ?? target}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmação de upgrade */}
      {upgradeTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-lg mb-2">
              Solicitar upgrade para {PLAN_LABEL[upgradeTarget] ?? upgradeTarget}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Sua solicitação será enviada para a equipe Valorem. Entraremos em contato em até 24h para confirmar o upgrade.
            </p>
            {upgradeError && (
              <p className="text-sm text-red-600 mb-3">{upgradeError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setUpgradeTarget(null)}
                disabled={requestingUpgrade}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
                Cancelar
              </button>
              <button
                onClick={confirmUpgrade}
                disabled={requestingUpgrade}
                className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition">
                {requestingUpgrade ? 'Enviando...' : 'Confirmar solicitação'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Informações da loja */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Informações da loja</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nome da loja</label>
              <input className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">URL do logotipo</label>
              <input className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="https://cdn.seusite.com.br/logo.png"
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Descrição</label>
              <textarea rows={3}
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
                placeholder="Breve descrição da sua loja..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Aparência */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Aparência</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Cor primária</label>
              <div className="flex items-center gap-3">
                <input type="color"
                  className="w-10 h-10 rounded border cursor-pointer"
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 flex-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black"
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Cor secundária</label>
              <div className="flex items-center gap-3">
                <input type="color"
                  className="w-10 h-10 rounded border cursor-pointer"
                  value={form.secondaryColor}
                  onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 flex-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black"
                  value={form.secondaryColor}
                  onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })} />
              </div>
            </div>
            {/* Preview */}
            <div className="md:col-span-2">
              <p className="text-xs text-gray-500 mb-2">Preview</p>
              <div className="flex gap-3">
                <div className="flex items-center justify-center w-24 h-10 rounded-lg text-sm font-medium"
                  style={{ background: form.primaryColor, color: form.secondaryColor }}>
                  Botão
                </div>
                <div className="flex items-center justify-center w-24 h-10 rounded-lg text-sm font-medium border"
                  style={{ background: form.secondaryColor, color: form.primaryColor }}>
                  Inverso
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Configurações de checkout */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Checkout e pagamento</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Moeda</label>
              <select className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="BRL">BRL — Real brasileiro</option>
                <option value="USD">USD — Dólar americano</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Máximo de parcelas</label>
              <select className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.maxInstallments}
                onChange={(e) => setForm({ ...form, maxInstallments: Number(e.target.value) })}>
                {[1, 2, 3, 4, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>{n}× parcela{n > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Valor mínimo do pedido (R$)</label>
              <input type="number" step="0.01" min="0"
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="0.00"
                value={form.minOrderValue}
                onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Frete grátis acima de (R$)</label>
              <input type="number" step="0.01" min="0"
                className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Desativado"
                value={form.freeShippingFrom}
                onChange={(e) => setForm({ ...form, freeShippingFrom: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => setForm({ ...form, allowGuestCheckout: !form.allowGuestCheckout })}
                  className={`w-11 h-6 rounded-full transition-colors relative
                    ${form.allowGuestCheckout ? 'bg-black' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                    ${form.allowGuestCheckout ? 'translate-x-5' : ''}`} />
                </div>
                <div>
                  <span className="text-sm font-medium">Checkout sem cadastro</span>
                  <p className="text-xs text-gray-400">Permite que clientes finalizem a compra sem criar uma conta</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <button onClick={save} disabled={saving}
          className="bg-black text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition">
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
