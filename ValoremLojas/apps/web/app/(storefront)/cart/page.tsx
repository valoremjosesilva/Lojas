'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCart } from '../../../lib/cart'

export default function CartPage() {
  const { items, removeItem, updateQuantity, total } = useCart()

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-5xl mb-4">🛒</p>
        <h2 className="text-2xl font-semibold mb-2">Seu carrinho está vazio</h2>
        <Link href="/" className="text-blue-600 hover:underline">Continuar comprando</Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">Carrinho</h1>

      <div className="space-y-4">
        {items.map((item) => (
          <div key={`${item.productId}:${item.variantId ?? ''}`} className="flex gap-4 items-center p-4 border rounded-xl">
            <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden relative flex-shrink-0">
              {item.imageUrl ? (
                <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">📦</div>
              )}
            </div>

            <div className="flex-1">
              <p className="font-medium">{item.name}</p>
              <p className="text-green-600 font-semibold">
                {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>

            <div className="flex items-center border rounded-lg overflow-hidden">
              <button
                className="px-2 py-1 bg-gray-100"
                onClick={() => updateQuantity(item.productId, item.quantity - 1, item.variantId)}
              >−</button>
              <span className="px-3">{item.quantity}</span>
              <button
                className="px-2 py-1 bg-gray-100"
                onClick={() => updateQuantity(item.productId, item.quantity + 1, item.variantId)}
              >+</button>
            </div>

            <button onClick={() => removeItem(item.productId, item.variantId)} className="text-red-400 hover:text-red-600 ml-2">✕</button>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t pt-6">
        <div className="flex justify-between text-xl font-bold mb-4">
          <span>Total</span>
          <span>{total().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>
        <Link
          href="/checkout"
          className="block w-full text-center py-4 rounded-xl bg-black text-white font-semibold text-lg hover:bg-gray-800"
        >
          Finalizar compra
        </Link>
      </div>
    </div>
  )
}
