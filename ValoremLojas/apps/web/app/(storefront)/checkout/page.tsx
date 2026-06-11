'use client'

import { useState } from 'react'
import { useCart } from '../../../lib/cart'
import { api } from '../../../lib/api'

type PaymentMethod = 'CREDIT_CARD' | 'WHITE_LABEL'

interface CardForm {
  nomeTitular: string
  numeroDoCartao: string
  mesVencimento: string
  anoVencimento: string
  codigoSeguranca: string
  cpfCnpj: string
  telefone: string
  // Endereço de cobrança (Valorem exige)
  cep: string
  logradouro: string
  numero: string
  bairro: string
  cidade: string
  uf: string
  complemento: string
}

const emptyCard: CardForm = {
  nomeTitular: '', numeroDoCartao: '', mesVencimento: '', anoVencimento: '',
  codigoSeguranca: '', cpfCnpj: '', telefone: '',
  cep: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '', complemento: '',
}

export default function CheckoutPage() {
  const { items, total, clear } = useCart()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CREDIT_CARD')
  const [installments, setInstallments] = useState(1)
  const [saveCard, setSaveCard] = useState(false)
  const [card, setCard] = useState<CardForm>(emptyCard)

  const [customer, setCustomer] = useState({
    name: '', email: '', phone: '', cpf: '',
    zipCode: '', street: '', number: '', district: '', city: '', state: '',
  })

  function handleCustomer(e: React.ChangeEvent<HTMLInputElement>) {
    setCustomer({ ...customer, [e.target.name]: e.target.value })
  }
  function handleCard(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setCard({ ...card, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (items.length === 0) return
    setError('')
    setLoading(true)

    try {
      const paymentPayload: any = { method, installments }

      if (method === 'CREDIT_CARD') {
        paymentPayload.card = {
          nomeTitular: card.nomeTitular,
          numeroDoCartao: card.numeroDoCartao.replace(/\s/g, ''),
          mesVencimento: parseInt(card.mesVencimento),
          anoVencimento: parseInt(card.anoVencimento),
          codigoSeguranca: card.codigoSeguranca,
          cpfCnpj: card.cpfCnpj.replace(/\D/g, ''),
          telefone: card.telefone.replace(/\D/g, ''),
          email: customer.email,
          cep: card.cep.replace(/\D/g, ''),
          logradouro: card.logradouro,
          numero: card.numero,
          bairro: card.bairro,
          cidade: card.cidade,
          uf: card.uf.toUpperCase(),
          complemento: card.complemento,
        }
        paymentPayload.saveCard = saveCard
      } else {
        // WHITE_LABEL — Valorem redireciona o cliente para o checkout deles
        paymentPayload.redirectUrl = `${window.location.origin}/checkout/confirmacao`
      }

      const res = await api.post('/checkout', {
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId ?? undefined,
          quantity: i.quantity,
        })),
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          cpf: customer.cpf.replace(/\D/g, ''),
        },
        shipping: {
          zipCode: customer.zipCode.replace(/\D/g, ''),
          street: customer.street,
          number: customer.number,
          district: customer.district,
          city: customer.city,
          state: customer.state.toUpperCase(),
        },
        payment: paymentPayload,
      })

      // White-label: salva o orderId para a página de confirmação, então redireciona
      if (res.checkoutUrl) {
        if (res.order?.id) localStorage.setItem('pending_order_id', res.order.id)
        window.location.href = res.checkoutUrl
        return
      }

      clear()
      setResult(res)
    } catch (err: any) {
      setError(err.message || 'Erro ao processar pedido. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ── Tela de sucesso ──────────────────────────────────────
  if (result) {
    const approved = result.status === 'approved'
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-5xl mb-4">{approved ? '✅' : '⏳'}</p>
        <h2 className="text-2xl font-bold mb-2">
          {approved ? 'Pagamento aprovado!' : 'Pedido recebido!'}
        </h2>
        <p className="text-gray-500 mb-2">
          Pedido #{result.payment?.orderId?.slice(0, 8).toUpperCase()}
        </p>
        {!approved && (
          <p className="text-sm text-gray-500 mt-4">
            Aguardando confirmação do pagamento. Você receberá um e-mail quando for aprovado.
          </p>
        )}
        {result.cardToken && (
          <p className="text-xs text-gray-400 mt-4">
            Cartão salvo para próximas compras.
          </p>
        )}
        <a href="/" className="inline-block mt-8 text-sm text-blue-600 hover:underline">
          Continuar comprando
        </a>
      </div>
    )
  }

  // ── Formulário ───────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">Finalizar Compra</h1>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* 1. Dados pessoais */}
        <Section title="Dados pessoais">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome completo" name="name" value={customer.name} onChange={handleCustomer} required span2 />
            <Field label="E-mail" name="email" type="email" value={customer.email} onChange={handleCustomer} required />
            <Field label="Telefone" name="phone" value={customer.phone} onChange={handleCustomer} placeholder="(47) 99999-9999" />
            <Field label="CPF" name="cpf" value={customer.cpf} onChange={handleCustomer} required placeholder="000.000.000-00" />
          </div>
        </Section>

        {/* 2. Endereço de entrega */}
        <Section title="Endereço de entrega">
          <div className="grid grid-cols-2 gap-3">
            <Field label="CEP" name="zipCode" value={customer.zipCode} onChange={handleCustomer} placeholder="00000-000" />
            <Field label="Rua / Logradouro" name="street" value={customer.street} onChange={handleCustomer} span2 />
            <Field label="Número" name="number" value={customer.number} onChange={handleCustomer} />
            <Field label="Bairro" name="district" value={customer.district} onChange={handleCustomer} />
            <Field label="Cidade" name="city" value={customer.city} onChange={handleCustomer} />
            <Field label="UF" name="state" value={customer.state} onChange={handleCustomer} maxLength={2} placeholder="SC" />
          </div>
        </Section>

        {/* 3. Forma de pagamento */}
        <Section title="Forma de pagamento">
          <div className="flex gap-3 mb-4">
            {([
              { id: 'CREDIT_CARD', label: '💳 Cartão de Crédito', desc: 'Preencha os dados aqui mesmo' },
              { id: 'WHITE_LABEL', label: '🔐 Checkout Valorem', desc: 'Redireciona para página segura' },
            ] as const).map((opt) => (
              <button key={opt.id} type="button" onClick={() => setMethod(opt.id)}
                className={`flex-1 p-3 rounded-xl border-2 text-left transition
                  ${method === opt.id ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-semibold text-sm">{opt.label}</p>
                <p className={`text-xs mt-0.5 ${method === opt.id ? 'text-gray-300' : 'text-gray-400'}`}>{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* Parcelamento */}
          <div className="flex items-center gap-3 mb-2">
            <label className="text-sm font-medium">Parcelas:</label>
            <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}
              className="border rounded-lg px-3 py-2 text-sm">
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => (
                <option key={n} value={n}>
                  {n}x de {(total() / n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  {n === 1 ? ' (à vista)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Campos do cartão — apenas no modo transparente */}
          {method === 'CREDIT_CARD' && (
            <div className="mt-4 grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl border">
              <Field label="Nome no cartão" name="nomeTitular" value={card.nomeTitular} onChange={handleCard} required span2 />
              <Field label="Número do cartão" name="numeroDoCartao" value={card.numeroDoCartao} onChange={handleCard}
                required placeholder="0000 0000 0000 0000" maxLength={19} span2 />
              <Field label="Mês vencimento" name="mesVencimento" value={card.mesVencimento} onChange={handleCard}
                required placeholder="MM" maxLength={2} />
              <Field label="Ano vencimento" name="anoVencimento" value={card.anoVencimento} onChange={handleCard}
                required placeholder="AAAA" maxLength={4} />
              <Field label="CVV" name="codigoSeguranca" value={card.codigoSeguranca} onChange={handleCard}
                required placeholder="123" maxLength={4} />
              <Field label="CPF/CNPJ do titular" name="cpfCnpj" value={card.cpfCnpj} onChange={handleCard}
                required placeholder="000.000.000-00" />
              <Field label="Telefone" name="telefone" value={card.telefone} onChange={handleCard}
                required placeholder="(47) 99999-9999" />

              <p className="col-span-2 text-xs font-semibold text-gray-500 mt-2 mb-1">Endereço de cobrança</p>
              <Field label="CEP" name="cep" value={card.cep} onChange={handleCard} required placeholder="00000-000" />
              <Field label="Logradouro" name="logradouro" value={card.logradouro} onChange={handleCard} required span2 />
              <Field label="Número" name="numero" value={card.numero} onChange={handleCard} required />
              <Field label="Bairro" name="bairro" value={card.bairro} onChange={handleCard} required />
              <Field label="Cidade" name="cidade" value={card.cidade} onChange={handleCard} required />
              <Field label="UF" name="uf" value={card.uf} onChange={handleCard} required placeholder="SC" maxLength={2} />
              <Field label="Complemento" name="complemento" value={card.complemento} onChange={handleCard} span2 />

              <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />
                Salvar cartão para próximas compras
              </label>
            </div>
          )}

          {method === 'WHITE_LABEL' && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
              Você será redirecionado para o checkout seguro da Valorem para inserir os dados do pagamento.
            </div>
          )}
        </Section>

        {/* Erro */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {/* Resumo e confirmar */}
        <div className="border-t pt-5">
          <div className="flex justify-between font-bold text-xl mb-5">
            <span>Total</span>
            <span className="text-green-600">{total().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
          <button type="submit" disabled={loading || items.length === 0}
            className="w-full py-4 rounded-xl bg-black text-white font-semibold text-lg
              hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition">
            {loading ? 'Processando...'
              : method === 'WHITE_LABEL' ? 'Ir para checkout seguro →'
              : 'Confirmar pagamento'}
          </button>
          <p className="text-xs text-center text-gray-400 mt-3">
            🔒 Pagamento processado pela Valorem Pay
          </p>
        </div>

      </form>
    </div>
  )
}

// ── Componentes auxiliares ───────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-base mb-3 text-gray-800">{title}</h2>
      {children}
    </section>
  )
}

function Field({
  label, name, value, onChange, required, placeholder, type = 'text',
  maxLength, span2,
}: {
  label: string; name: string; value: string
  onChange: (e: any) => void
  required?: boolean; placeholder?: string; type?: string
  maxLength?: number; span2?: boolean
}) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && ' *'}</label>
      <input
        type={type} name={name} value={value} onChange={onChange}
        required={required} placeholder={placeholder} maxLength={maxLength}
        className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
      />
    </div>
  )
}
